import { cp, mkdir, readFile, writeFile, symlink, rename, rm, realpath, lstat } from 'node:fs/promises';
import { resolve, join, dirname, basename, relative } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomUUID } from 'node:crypto';
import { patchesFor, HOST_VERSIONS, REVISION, BLOCK_TITLE } from './patches.mjs';
const hash = value => createHash('sha256').update(value).digest('hex');
const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
const inside = (parent, path) => path === parent || (!relative(parent, path).startsWith('..') && !relative(parent, path).startsWith('/'));
async function reviewedHost(path) {
  const root = await realpath(path);
  const pkg = await readJson(join(root, 'package.json'));
  if (pkg.name !== '@deepseek-ai/dsh' || !HOST_VERSIONS.includes(pkg.version)) throw new Error('Unsupported dsh version ' + pkg.version + '; reviewed: ' + HOST_VERSIONS.join(', '));
  const version = pkg.version, patches = patchesFor(version);
  for (const item of patches) {
    const dir = join(root, 'node_modules/@deepseek-ai', item.name);
    const meta = await readJson(join(dir, 'package.json'));
    // The copy keeps upstream package.json, whose exact @deepseek-ai/dsh-* peers equal the host
    // version; dsh-app-boot therefore accepts it only on this same host version.
    if (meta.name !== '@deepseek-ai/' + item.name || meta.version !== version) throw new Error('Unsupported package version: ' + item.name);
    if (hash(await readFile(join(dir, 'lib/index.js'))) !== item.sha256) throw new Error('Unreviewed source fingerprint: ' + item.name);
  }
  return { root, version, patches };
}
async function targetPath(input, hostRoot) {
  const absolute = resolve(input);
  const parent = await realpath(dirname(absolute));
  const target = join(parent, basename(absolute));
  if (inside(resolve(homedir(), '.dsh'), target) || target === parent || (hostRoot && inside(hostRoot, target))) throw new Error('Use a separate support directory, outside the host installation and ~/.dsh');
  const info = await lstat(target).catch(e => { if (e.code !== 'ENOENT') throw e; });
  if (info?.isSymbolicLink()) throw new Error('Support directory must not be a symlink');
  return target;
}
async function atomic(path, value) {
  const temporary = path + '.' + randomUUID() + '.tmp';
  try { await writeFile(temporary, value, { flag: 'wx' }); await rename(temporary, path); }
  finally { await rm(temporary, { force: true }); }
}
async function locked(target, operation) {
  await mkdir(target, { recursive: true });
  const lock = join(target, '.install-lock');
  try { await mkdir(lock); } catch (error) { if (error.code === 'EEXIST') throw new Error('Host support installer is busy'); throw error; }
  try { return await operation(); } finally { await rm(lock, { recursive: true }); }
}
async function activation(target) {
  try { return await readJson(join(target, 'activation.json')); }
  catch (error) { if (error.code === 'ENOENT') return { active: null, history: [] }; throw error; }
}
async function verifyRelease(target, release) {
  if (!/^v1-[a-f0-9]{20}$/.test(release)) throw new Error('Invalid release identity');
  const dir = join(target, 'releases', release), manifest = await readJson(join(dir, 'manifest.json'));
  const host = await reviewedHost(manifest.hostRoot), hostRoot = host.root;
  if (manifest.release !== release) throw new Error('Release integrity mismatch');
  if (manifest.hostVersion !== host.version) throw new Error('Host version changed from ' + manifest.hostVersion + ' to ' + host.version + '; run install for the new host');
  const patches = host.patches;
  for (const item of manifest.packages) {
    if (!patches.some(p => p.directory === item.directory)) throw new Error('Unknown release package');
    if (hash(await readFile(join(dir, item.directory, 'lib/index.js'))) !== item.patchedHash) throw new Error('Release integrity mismatch: ' + item.directory);
    if (await realpath(join(dir, item.directory, 'node_modules')) !== join(hostRoot, 'node_modules')) throw new Error('Dependency link integrity mismatch');
  }
  const patch = await readFile(join(dir, 'patch.yml'), 'utf8');
  if (hash(patch) !== manifest.patchHash) throw new Error('Patch integrity mismatch');
  return { ...manifest, patch };
}
async function activate(target, next, previous, history) {
  const verified = next === null ? null : await verifyRelease(target, next);
  const nextState = { active: next, history: history ?? [...previous.history, previous.active] };
  // Each file is atomic; doctor rejects any interrupted mismatch before launch.
  await atomic(join(target, 'activation.json'), JSON.stringify(nextState, null, 2));
  await atomic(join(target, 'active.patch.yml'), verified?.patch ?? '[]\n');
  return { release: next, target, patch: join(target, 'active.patch.yml') };
}
export async function install({ hostRoot: input, target: targetInput }) {
  const host = await reviewedHost(input), hostRoot = host.root, patches = host.patches, HOST_VERSION = host.version;
  const target = await targetPath(targetInput, hostRoot);
  return locked(target, async () => {
    const release = 'v1-' + hash(JSON.stringify({ hostRoot, hostVersion: HOST_VERSION, revision: REVISION, fingerprints: patches.map(p => p.sha256) })).slice(0, 20);
    const finalDir = join(target, 'releases', release), previous = await activation(target);
    const exists = await lstat(finalDir).catch(e => { if (e.code !== 'ENOENT') throw e; });
    if (!exists) {
      const stage = join(target, '.stage-' + randomUUID()); await mkdir(stage);
      try {
        const packages = [];
        for (const item of patches) {
          const source = join(hostRoot, 'node_modules/@deepseek-ai', item.name), dest = join(stage, item.directory);
          await cp(source, dest, { recursive: true, filter: path => path !== join(source, 'node_modules') });
          const code = item.apply(await readFile(join(source, 'lib/index.js'), 'utf8'));
          await writeFile(join(dest, 'lib/index.js'), code);
          await symlink(join(hostRoot, 'node_modules'), join(dest, 'node_modules'), 'dir');
          packages.push({ name: item.name, directory: item.directory, originalHash: item.sha256, patchedHash: hash(code) });
        }
        const patch = patches.map(item => `- id: ${item.id}\n  disabled: true\n- insert:\n    - id: widget-host-${item.id}\n      name: ${JSON.stringify(join(finalDir, item.directory, 'lib/index.js'))}\n`).join('');
        await writeFile(join(stage, 'patch.yml'), patch);
        await writeFile(join(stage, 'manifest.json'), JSON.stringify({ version: 1, release, revision: REVISION, hostVersion: HOST_VERSION, hostRoot, packages, patchHash: hash(patch) }, null, 2));
        await mkdir(dirname(finalDir), { recursive: true }); await rename(stage, finalDir);
      } finally { await rm(stage, { recursive: true, force: true }); }
    }
    if (previous.active === release) return activate(target, release, previous, previous.history);
    return activate(target, release, previous, previous.active === null && previous.history.length === 0 ? [] : undefined);
  });
}
export async function doctor(targetInput) {
  const target = await targetPath(targetInput), state = await activation(target);
  if (state.active === null) {
    if (await readFile(join(target, 'active.patch.yml'), 'utf8') !== '[]\n') throw new Error('Activation integrity mismatch');
    return { release: null, target, disabled: true };
  }
  const verified = await verifyRelease(target, state.active);
  if (await readFile(join(target, 'active.patch.yml'), 'utf8') !== verified.patch) throw new Error('Activation integrity mismatch; reinstall or rollback before launch');
  return { release: state.active, target, hostRoot: verified.hostRoot, hostVersion: verified.hostVersion, patch: join(target, 'active.patch.yml') };
}
/**
 * Profile patch block for the active release, wrapped in BEGIN/END markers that name the reviewed
 * dsh version. Paste it into a profile's cordis.patch.yml in place of any older block; tools such as
 * dsh-projects' profile-compat treat the BEGIN/END block as one unit.
 */
export async function profileBlock(targetInput) {
  const state = await doctor(targetInput);
  if (state.disabled) throw new Error('Host support is disabled; nothing to add to a profile');
  const patch = await readFile(state.patch, 'utf8');
  return `# BEGIN ${BLOCK_TITLE} (reviewed dsh ${state.hostVersion}, revision ${REVISION}, release ${state.release})\n`
    + `# Regenerate after every dsh upgrade: dsh-widget-host install --host-root <dsh> --target ${state.target} && dsh-widget-host profile-block --target ${state.target}\n`
    + patch + `# END ${BLOCK_TITLE}\n`;
}
export async function rollback(targetInput) {
  const target = await targetPath(targetInput);
  return locked(target, async () => {
    const previous = await activation(target);
    if (!previous.history.length) throw new Error('No earlier activation; use disable to return to stock host');
    const history = previous.history.slice(), next = history.pop();
    return activate(target, next, previous, history);
  });
}
export async function disable(targetInput) {
  const target = await targetPath(targetInput);
  return locked(target, async () => {
    const previous = await activation(target);
    return activate(target, null, previous, previous.active === null ? previous.history : undefined);
  });
}
