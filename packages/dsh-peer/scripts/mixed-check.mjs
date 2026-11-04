// Mixed mode end to end with real packed DSH hosts and a temporary Peer Hub
// centre (never a shared one):
//   A ("alice") and B ("reviewer"): two dsh processes of the SAME DSH_HOME and
//   profile, sharing one device credential and one peer registry (one machine);
//   C ("carol"): another DSH_HOME with its own credential (a remote machine).
// Scenarios
//   MX01 both processes of the shared credential are online at once (2 connections)
//   MX02 discovery: B listed as local, C as hub peer of device "vps"
//   MX03 A↔C request/question/answer/result through the centre: every message
//        walks queued → claimed → delivered → consumed
//   MX04 A↔B request/question/answer/result over the socket (after MX03, so the
//        centre already holds rows): its messages and message_events tables do not change
//   MX05 centre stopped: A↔B still completes, peer_list reports the centre
//        offline; centre restarted: A↔C completes again
// The packed plugin resolves @lbryany/peer-hub-client from PEER_HUB_DIR
// (default ../../../peer-hub). A deterministic provider replaces the model.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawn, execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import * as sqlite from 'node:sqlite';
import assert from 'node:assert/strict';

const peerHub = resolve(process.env.PEER_HUB_DIR || new URL('../../../../peer-hub/', import.meta.url).pathname);
const { createHubServer } = await import(pathToFileURL(join(peerHub, 'server/server.js')));
const pkg = resolve(new URL('..', import.meta.url).pathname), evidence = join(pkg, 'test/evidence/mixed-host-' + Date.now()); mkdirSync(evidence, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), 'peer-mixed-host-'));
const bin = process.env.DSH_BIN || '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js', runtime = join(resolve(dirname(bin), '..'), 'node_modules');
const LEASE = 1500, centreDir = join(tmp, 'centre');
let hub, hubPort; const hosts = [], scenarios = [], proof = {};
const sleep = ms => new Promise(r => setTimeout(r, ms));
function report(h) { try { return JSON.parse(readFileSync(h.report, 'utf8')); } catch { return null; } }
async function until(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    for (const h of hosts) { if (h.process && h.process.exitCode !== null && !h.stopped) throw Error(`${h.name} exited ${h.process.exitCode}`); const r = report(h); if (r?.error) throw Error(r.error); }
    try { if (await fn()) return; } catch { /* centre restarting */ }
    await sleep(100);
  }
  throw Error('Timed out: ' + label);
}
async function freePort() { const s = createServer(); await new Promise(r => s.listen(0, '127.0.0.1', r)); const p = s.address().port; await new Promise(r => s.close(r)); return p; }
async function admin(op, args = {}) {
  return (await fetch(hub.url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${hub.adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args: { workspace: 'default', ...args } }) })).json();
}
// Direct read of the centre's event table (WAL: safe beside the running centre).
function eventRows() {
  const db = new (sqlite.Database || sqlite.DatabaseSync)(join(centreDir, 'hub.sqlite'), { readOnly: true });
  try { return db.prepare('SELECT seq, message_id, state, session_name FROM message_events ORDER BY seq').all(); } finally { db.close(); }
}
async function startCentre() { hub = createHubServer({ dir: centreDir, port: hubPort ?? 0, limits: { leaseMs: LEASE } }); await hub.start(); hubPort = Number(new URL(hub.url).port); }
async function stopHost(h) {
  h.stopped = true; if (h.process?.exitCode === null) {
    h.process.kill('SIGTERM'); await Promise.race([new Promise(r => h.process.once('exit', r)), sleep(4000)]);
    if (h.process.exitCode === null && h.process.signalCode === null) { h.process.kill('SIGKILL'); await new Promise(r => h.process.once('exit', r)); }
  }
}
function startHost(h) {
  h.stopped = false; const oldBoot = report(h)?.boot || 0;
  h.process = spawn(process.execPath, [bin, '--profile', 'mixed-test', '--port', String(h.port), '--no-open'], {
    cwd: h.cwd, env: { ...process.env, DSH_HOME: h.home, DSH_PEER_NAME: h.name, HUB_FIXTURE: h.fixture, DSH_TELEMETRY: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  h.process.stdout.on('data', d => { h.logs += d; }); h.process.stderr.on('data', d => { h.logs += d; });
  return until(() => { const r = report(h); return r?.ready && r.boot > oldBoot; }, h.name + ' ready', 40000);
}
function command(h, text) { writeFileSync(h.command, JSON.stringify({ id: crypto.randomUUID(), text })); }
const toolResults = h => (report(h)?.events || []).filter(e => e.type === 'tool/result');
const textOf = e => (e?.data?.message?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
// A refused send/request (protection, unknown peer, centre error) is a failed tool call.
const failed = e => e.data?.message?.isError === true || /^(未投递|请求未完成)/.test(textOf(e)) || /"ok":false/.test(textOf(e));
// The requester saw the result of its newest request to `to`.
const completed = (h, text) => report(h)?.calls.some(c => c.kind === 'result' && JSON.stringify(c.messages).includes(text));
async function machine(name, deviceName, url) {
  const root = join(tmp, name), home = join(root, 'home'), profile = join(home, 'profiles', 'mixed-test');
  mkdirSync(join(profile, 'node_modules', '@lbryany'), { recursive: true });
  const pairing = await admin('pair.create', { name: deviceName, runtime: 'dsh' }); assert.equal(pairing.ok, true, pairing.error);
  await promisify(execFile)(process.execPath, [join(peerHub, 'bin/peer.js'), 'join', url, '--code', pairing.code, '--credential', join(root, 'credential.json')], { env: { ...process.env, PEER_HUB_HOME: join(root, 'peer-home') } });
  symlinkSync(machine.unpack, join(profile, 'node_modules', '@lbryany', 'dsh-peer'), 'dir');
  writeFileSync(join(profile, 'package.json'), JSON.stringify({ name: 'peer-mixed-test', private: true, type: 'module', dependencies: { '@lbryany/dsh-peer': machine.version }, dsh: { profile: { bundles: ['@deepseek-ai/dsh-base', '@deepseek-ai/dsh-web-app', '@lbryany/dsh-peer'] } } }));
  const fixture = join(profile, 'node_modules', 'hub-fixture'); mkdirSync(fixture); symlinkSync(runtime, join(fixture, 'node_modules'), 'dir');
  writeFileSync(join(fixture, 'package.json'), JSON.stringify({ name: 'hub-fixture', type: 'module', main: 'index.js' })); writeFileSync(join(fixture, 'index.js'), readFileSync(join(pkg, 'test/hub-host-fixture.mjs')));
  // One profile for every host of this machine: names and fixture settings come from the environment.
  writeFileSync(join(profile, 'cordis.patch.yml'), `- id: dsh-peer\n  config:\n    dir: ${JSON.stringify(join(root, 'registry'))}\n    namesFile: ${JSON.stringify(join(root, 'names.json'))}\n    hub:\n      credentialFile: ${JSON.stringify(join(root, 'credential.json'))}\n      stateDir: ${JSON.stringify(join(root, 'receipts'))}\n      heartbeatMs: 200\n- id: hmr\n  disabled: true\n- insert:\n    - id: hub-fixture\n      name: hub-fixture\n      config: {}\n`);
  return { root, home };
}
async function host(m, name, sessionId) {
  const dir = join(m.root, name); mkdirSync(dir);
  const h = { name, sessionId, home: m.home, cwd: dir, report: join(dir, 'report.json'), command: join(dir, 'command.json'), fixture: join(dir, 'fixture.json'), port: await freePort(), logs: '' };
  writeFileSync(h.fixture, JSON.stringify({ name, sessionId, report: h.report, command: h.command, marker: join(dir, 'created'), cwd: dir }));
  hosts.push(h); await startHost(h); return h;
}
try {
  const pack = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', tmp, '--cache', join(tmp, 'cache')], { cwd: pkg, encoding: 'utf8' }))[0];
  const install = join(tmp, 'install'); mkdirSync(install); execFileSync('tar', ['-xzf', join(tmp, pack.filename), '-C', install]);
  const unpack = join(install, 'package'); symlinkSync(runtime, join(unpack, 'node_modules'), 'dir');
  mkdirSync(join(install, 'node_modules', '@lbryany'), { recursive: true });
  symlinkSync(join(peerHub, 'packages/client'), join(install, 'node_modules', '@lbryany', 'peer-hub-client'), 'dir');
  Object.assign(machine, { unpack, version: pack.version });
  await startCentre();
  const health = await (await fetch(hub.url + '/health')).json(); assert.equal(health.ok, true); assert.equal(health.protocol, 3, 'centre with multi-connection devices');
  const mac = await machine('mac', 'mac', hub.url), vps = await machine('vps', 'vps', hub.url);
  const c = await host(vps, 'carol', 'session-cccc-mixed');
  const a = await host(mac, 'alice', 'session-aaaa-mixed'), b = await host(mac, 'reviewer', 'session-bbbb-mixed');

  // MX01 — two processes, one credential, both online.
  await until(async () => (await admin('inspect')).sessions.filter(s => s.online).length === 3, 'three sessions online');
  const devices = (await admin('admin.devices')).devices, sessions = (await admin('inspect')).sessions;
  const byNative = id => sessions.find(s => s.nativeSession === id);
  assert.equal(devices.find(d => d.name === 'mac').connections, 2, 'shared credential: two live connections');
  assert.equal(byNative(a.sessionId).deviceId, byNative(b.sessionId).deviceId, 'A and B are one device');
  assert.notEqual(byNative(a.sessionId).deviceId, byNative(c.sessionId).deviceId);
  proof.MX01 = { macConnections: 2, sessions: sessions.map(s => ({ name: s.name, device: s.device, online: s.online })) };
  scenarios.push({ id: 'MX01', ok: true });

  // MX02 — discovery.
  command(a, 'discover');
  await until(() => toolResults(a).some(e => JSON.stringify(e).includes('carol')), 'discovery');
  const listed = JSON.stringify(toolResults(a).at(-1));
  assert.match(listed, /reviewer \[local\]/); assert.match(listed, /carol \[hub, vps\]/); assert.doesNotMatch(listed, /reviewer \[hub/, 'one entry for B, as local');
  proof.MX02 = { peerList: textOf(toolResults(a).at(-1)) };
  scenarios.push({ id: 'MX02', ok: true });

  // MX03 — A↔C through the centre, full receipt history.
  command(a, 'ask:carol|remote review');
  await until(async () => { const r = (await admin('inspect')).requests; return r.length === 1 && r[0].state === 'complete'; }, 'remote request complete');
  await until(async () => (await admin('inspect')).messages.every(m => m.state === 'consumed'), 'remote messages consumed');
  const remote = (await admin('inspect')).messages;
  assert.deepEqual(remote.map(m => m.exchange.kind), ['request', 'question', 'answer', 'result']);
  for (const m of remote) {
    const states = m.timeline.map(e => e.state).filter((s, i, all) => s !== all[i - 1]);
    assert.deepEqual(states, ['queued', 'claimed', 'delivered', 'consumed'], `${m.exchange.kind} history ${states}`);
  }
  assert.equal(remote.every(m => [m.from.name, m.to.name].sort().join() === 'alice,carol'), true, 'only A↔C is in the centre');
  proof.MX03 = remote.map(m => ({ kind: m.exchange.kind, from: m.from.name, to: m.to.name, timeline: m.timeline.map(e => e.state) }));
  scenarios.push({ id: 'MX03', ok: true });

  // MX04 — A↔B over the socket only.
  const before = { messages: (await admin('inspect')).messages.length, events: eventRows().length };
  command(a, 'ask:reviewer|local review');
  await until(() => report(a).calls.filter(x => x.kind === 'result').length === 2, 'local request complete');
  assert.equal(report(b).calls.filter(x => x.kind === 'request').length, 1, 'B handled the task');
  const after = { messages: (await admin('inspect')).messages.length, events: eventRows().length };
  assert.deepEqual(after, before, 'no message or message_events row for A↔B');
  const localKinds = (report(b).received || []).length; assert.equal(localKinds, 0, 'B received nothing through the centre');
  proof.MX04 = { before, after, aliceHandled: report(a).calls.filter(x => x.kind !== 'user').map(x => x.kind), reviewerHandled: report(b).calls.filter(x => x.kind !== 'user').map(x => x.kind), reviewerViaCentre: localKinds };
  scenarios.push({ id: 'MX04', ok: true });

  // MX05 — centre down: local still works; centre back: remote works.
  await hub.stop();
  command(a, 'discover');
  await until(() => toolResults(a).at(-1) && JSON.stringify(toolResults(a).at(-1)).includes('中心离线'), 'peer_list reports the centre offline');
  command(a, 'ask:reviewer|centre down review');
  await until(() => report(a).calls.filter(x => x.kind === 'result').length === 3, 'local request complete while the centre is down');
  await startCentre();
  await until(async () => (await admin('inspect')).sessions.filter(s => s.online).length === 3, 'sessions back online after centre restart');
  command(a, 'ask:carol|after centre restart');
  await until(async () => (await admin('inspect')).requests.filter(r => r.state === 'complete').length === 2, 'remote request after centre restart');
  const total = (await admin('inspect')).messages;
  assert.equal(total.length, 8, 'only the two A↔C exchanges are in the centre');
  assert.equal(total.some(m => m.text.includes('centre down review') || m.text.includes('local review')), false);
  proof.MX05 = { offlineList: textOf(toolResults(a).filter(e => textOf(e).includes('中心离线')).at(-1)), centreMessages: total.length, eventSessions: [...new Set(eventRows().map(e => e.session_name))] };
  scenarios.push({ id: 'MX05', ok: true });

  for (const h of hosts) assert.deepEqual(toolResults(h).filter(failed).map(textOf), [], `${h.name}: no failed tool call`);
  const final = await admin('inspect');
  writeFileSync(join(evidence, 'result.json'), JSON.stringify({ ok: true, version: pack.version, centre: health, scenarios, proof,
    state: { devices: (await admin('admin.devices')).devices, sessions: final.sessions, requests: final.requests, messages: final.messages.map(({ claimToken: _c, ...m }) => m) },
    eventTable: eventRows() }, null, 2));
  console.log(JSON.stringify({ ok: true, version: pack.version, scenarios, evidence }));
} catch (error) {
  writeFileSync(join(evidence, 'failure.txt'), String(error.stack)); console.error(error.stack); process.exitCode = 1;
} finally {
  for (const h of hosts) { await stopHost(h); writeFileSync(join(evidence, h.name + '.log'), h.logs.replace(/token=[^\s&]+/g, 'token=REDACTED')); const r = report(h); if (r) writeFileSync(join(evidence, h.name + '.json'), JSON.stringify(r, null, 2)); }
  await hub?.stop().catch(() => {});
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(evidence, 'cleanup.json'), JSON.stringify({ temporaryHomeRemoved: !existsSync(tmp), children: hosts.map(h => ({ name: h.name, pid: h.process?.pid, exitCode: h.process?.exitCode, signal: h.process?.signalCode })) }, null, 2));
}
