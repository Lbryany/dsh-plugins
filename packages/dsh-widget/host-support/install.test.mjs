import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { install, doctor, rollback, disable } from './install.mjs';
const installed = process.env.WIDGET_TEST_DSH_ROOT ?? '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh';
const dirs = [];
afterEach(async () => { for (const dir of dirs.splice(0)) await rm(dir, { recursive: true, force: true }); });
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'widget-host-')); dirs.push(root);
  const host = join(root, 'host'); await mkdir(host);
  await cp(join(installed, 'package.json'), join(host, 'package.json'));
  for (const name of ['dsh-api-session-controller', 'dsh-agent-loop']) {
    const path = join(host, 'node_modules/@deepseek-ai', name);
    await mkdir(join(path, 'lib'), { recursive: true });
    for (const file of ['package.json', 'lib/index.js']) await cp(join(installed, 'node_modules/@deepseek-ai', name, file), join(path, file));
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
