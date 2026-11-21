import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install, doctor, rollback, disable, profileBlock } from './install.mjs';
import { HOST_VERSIONS } from './patches.mjs';
// WIDGET_TEST_DSH_ROOTS (path-delimited) lists extra reviewed hosts, e.g. an unpacked 0.2.1-rc.5
// (package.json + the two upstream packages) next to the installed 0.2.2-rc.1.
const installed = process.env.WIDGET_TEST_DSH_ROOT ?? '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh';
const extraHosts = (process.env.WIDGET_TEST_DSH_ROOTS ?? '').split(':').filter(Boolean);
const dirs = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function fixture(source = installed) {
  const root = await mkdtemp(join(tmpdir(), 'widget-host-')); dirs.push(root);
  const host = join(root, 'host'); await mkdir(host);
  await cp(join(source, 'package.json'), join(host, 'package.json'));
  for (const name of ['dsh-api-session-controller', 'dsh-agent-loop']) {
    const path = join(host, 'node_modules/@deepseek-ai', name);
    await mkdir(join(path, 'lib'), { recursive: true });
    for (const file of ['package.json', 'lib/index.js']) await cp(join(source, 'node_modules/@deepseek-ai', name, file), join(path, file));
  }
  return { root, host, target: join(root, 'support') };
}
test('installs immutable copies, checks integrity and is idempotent', async () => {
  const { host, target } = await fixture();
  const before = await readFile(join(host, 'node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js'));
  const a = await install({ hostRoot: host, target });
  const b = await install({ hostRoot: host, target });
  assert.equal(a.release, b.release);
  assert.equal((await doctor(target)).release, a.release);
  assert.deepEqual(await readFile(join(host, 'node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js')), before);
  const activation = JSON.parse(await readFile(join(target, 'activation.json')));
  assert.equal(activation.history.length, 0);
  const patch = await readFile(join(target, 'active.patch.yml'), 'utf8');
  assert.match(patch, /session-controller/); assert.match(patch, /agent-loop/);
  assert.match(await readFile(join(target, 'releases', a.release, 'agent-loop/lib/index.js'), 'utf8'), /machine.cancel\(\{ kind: "disposed" \}, \{ keepInbox: true \}\)/);
});
test('switches host installations and rolls back or disables without editing profiles', async () => {
  const a = await fixture(), b = await fixture();
  const first = await install({ hostRoot: a.host, target: a.target });
  const second = await install({ hostRoot: b.host, target: a.target });
  assert.notEqual(first.release, second.release);
  assert.equal((await rollback(a.target)).release, first.release);
  await disable(a.target);
  assert.equal(await readFile(join(a.target, 'active.patch.yml'), 'utf8'), '[]\n');
  assert.equal((await rollback(a.target)).release, first.release);
});
test('rejects unreviewed source before publishing an activation', async () => {
  const { host, target } = await fixture();
  await writeFile(join(host, 'node_modules/@deepseek-ai/dsh-agent-loop/lib/index.js'), '// unexpected code');
  await assert.rejects(install({ hostRoot: host, target }), /fingerprint/i);
  await assert.rejects(readFile(join(target, 'active.patch.yml')), { code: 'ENOENT' });
});
test('doctor detects modified copies and an upgraded external host', async () => {
  const { host, target } = await fixture();
  const saved = await install({ hostRoot: host, target });
  const file = join(target, 'releases', saved.release, 'agent-loop/lib/index.js');
  const original = await readFile(file);
  await writeFile(file, '// tampered');
  await assert.rejects(doctor(target), /integrity/i);
  await writeFile(file, original);
  const pkg = JSON.parse(await readFile(join(host, 'package.json'))); pkg.version = '99.0.0';
  await writeFile(join(host, 'package.json'), JSON.stringify(pkg));
  await assert.rejects(doctor(target), /version/i);
});
test('reinstall repairs an interrupted activation without adding rollback history', async () => {
  const { host, target } = await fixture();
  const saved = await install({ hostRoot: host, target });
  await writeFile(join(target, 'active.patch.yml'), '[]\n');
  await assert.rejects(doctor(target), /Activation integrity/);
  await install({ hostRoot: host, target });
  assert.equal((await doctor(target)).release, saved.release);
  assert.deepEqual(JSON.parse(await readFile(join(target, 'activation.json'))).history, []);
});
for (const source of [installed, ...extraHosts]) {
  test('patches the reviewed host at ' + source + ' and emits a versioned profile block', async () => {
    const { host, target } = await fixture(source);
    const version = JSON.parse(await readFile(join(host, 'package.json'))).version;
    assert.ok(HOST_VERSIONS.includes(version), version);
    const saved = await install({ hostRoot: host, target });
    const dir = join(target, 'releases', saved.release);
    assert.match(await readFile(join(dir, 'session-controller/lib/index.js'), 'utf8'), /registerWidgetInputCaptureV2\(capture\)/);
    assert.match(await readFile(join(dir, 'agent-loop/lib/index.js'), 'utf8'), /machine.cancel\(\{ kind: "disposed" \}, \{ keepInbox: true \}\)/);
    // dsh-app-boot compatibility: every @deepseek-ai/dsh-* peer of the copy pins this host version.
    for (const name of ['session-controller', 'agent-loop']) {
      const pkg = JSON.parse(await readFile(join(dir, name, 'package.json')));
      assert.equal(pkg.version, version);
      for (const [dep, range] of Object.entries(pkg.peerDependencies)) if (/^@deepseek-ai\/dsh(-|$)/.test(dep)) assert.equal(range, version, dep);
    }
    const block = await profileBlock(target);
    assert.match(block, new RegExp('^# BEGIN dsh-widget interaction host support \\(reviewed dsh ' + version.replace(/\./g, '\\.') + ', '));
    assert.match(block, /\n# END dsh-widget interaction host support\n$/);
    assert.ok(block.includes(await readFile(join(target, 'active.patch.yml'), 'utf8')));
  });
}
test('an installed release refuses a host that moved to another reviewed version', async () => {
  const { host, target } = await fixture();
  await install({ hostRoot: host, target });
  const pkg = JSON.parse(await readFile(join(host, 'package.json')));
  const other = HOST_VERSIONS.find(v => v !== pkg.version);
  pkg.version = other; await writeFile(join(host, 'package.json'), JSON.stringify(pkg));
  await assert.rejects(doctor(target), /version/i);
  await assert.rejects(profileBlock(target), /version/i);
});
