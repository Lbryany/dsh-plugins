// Mixed mode: same-machine sessions over the socket, remote ones through a
// real temporary Peer Hub centre. A and B share one credential and one
// registry (two processes of one machine); C is another device.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createPeerCore } from '../lib/core.js';
const peerHubDir = process.env.PEER_HUB_DIR || new URL('../../../../peer-hub/', import.meta.url).pathname;
const { createHubServer } = await import(pathToFileURL(join(peerHubDir, 'server/server.js')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(check, label = 'condition') { for (let i = 0; i < 200; i++) { if (await check()) return; await sleep(25); } assert.fail(`${label} timed out`); }
const sids = { a: 'session-aaaa-0001', b: 'session-bbbb-0002', c: 'session-cccc-0003' };

async function setup(t, { names = { a: 'alice', b: 'bob', c: 'carol' } } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'mixed-'));
  let hub = createHubServer({ dir: join(dir, 'centre'), port: 0, limits: { leaseMs: 1500 } }); await hub.start();
  const port = Number(new URL(hub.url).port);
  const admin = async (op, args = {}) => (await fetch(hub.url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${hub.adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args }) })).json();
  const credential = async name => {
    const minted = await admin('device.create', { name }); const file = join(dir, `${name}.credential.json`);
    writeFileSync(file, JSON.stringify({ ...minted.credential, url: hub.url }), { mode: 0o600 }); return file;
  };
  const mac = await credential('mac'), vps = await credential('vps');
  const got = [], cores = {};
  function make(key, { pid, registry, credentialFile, stateDir }) {
    const sid = sids[key], received = [];
    const agent = { session: { deriveMessages: () => received }, inbox: { nextTurn: [], nextStep: [] },
      followup(m) { received.push(m); got.push({ to: key, m }); queueMicrotask(() => core.consume(sid, m.source)); }, steer(m) { this.followup(m); } };
    const core = createPeerCore({ dir: registry, pid, isAlive: () => true, namesFile: join(dir, `${key}-names.json`), fixedName: names[key],
      agents: { get: id => id === sid ? agent : undefined }, makeMessage: (text, source) => ({ content: [{ type: 'text', text }], source }),
      persistMessage: async () => true, hub: { credentialFile, stateDir, heartbeatMs: 100 } });
    cores[key] = { core, sid, agent, received };
    return core;
  }
  const machine = join(dir, 'mac-registry');
  make('c', { pid: process.pid + 200000, registry: join(dir, 'vps-registry'), credentialFile: vps, stateDir: join(dir, 'vps-state') });
  make('a', { pid: process.pid, registry: machine, credentialFile: mac, stateDir: join(dir, 'mac-state') });
  make('b', { pid: process.pid + 100000, registry: machine, credentialFile: mac, stateDir: join(dir, 'mac-state') });
  // C first, so a duplicate name stays C's on the centre.
  cores.c.core.register({ id: sids.c, cwd: '/srv/c' }); await cores.c.core.start();
  await until(async () => (await admin('inspect')).sessions.some(s => s.nativeSession === sids.c && s.online), 'C registered');
  for (const k of ['a', 'b']) { cores[k].core.register({ id: sids[k], cwd: `/work/${k}` }); await cores[k].core.start(); cores[k].core.flush(); }
  await until(async () => (await admin('inspect')).sessions.filter(s => s.online).length === 3, 'all three online');
  t.after(async () => { for (const k of ['a', 'b', 'c']) await cores[k].core.stop(); await hub.stop(); rmSync(dir, { recursive: true, force: true }); });
  const messages = async () => (await admin('inspect')).messages;
  return { cores, got, admin, messages, received: key => got.filter(g => g.to === key).map(g => g.m),
    async stopHub() { await hub.stop(); }, async startHub() { hub = createHubServer({ dir: join(dir, 'centre'), port, limits: { leaseMs: 1500 } }); await hub.start(); } };
}
const { a: A, b: B, c: C } = { a: 'a', b: 'b', c: 'c' };

test('X01 one credential, two processes: both online on the centre as one device', async t => {
  const x = await setup(t);
  const s = (await x.admin('inspect')).sessions;
  const alice = s.find(v => v.nativeSession === sids.a), bob = s.find(v => v.nativeSession === sids.b), carol = s.find(v => v.nativeSession === sids.c);
  assert.equal(alice.online && bob.online && carol.online, true);
  assert.equal(alice.deviceId, bob.deviceId); assert.notEqual(alice.deviceId, carol.deviceId);
  assert.equal((await x.admin('admin.devices')).devices.find(d => d.name === 'mac').connections, 2);
});

test('X02 routing: same-machine request/result never touches the centre; remote goes through it', async t => {
  const x = await setup(t), a = x.cores.a.core, b = x.cores.b.core, c = x.cores.c.core;
  const r = await a.request({ from: sids.a, to: 'bob', text: 'local review' });
  assert.equal(r.ok, true, r.text); assert.equal(r.requests[0].via, 'local');
  await until(() => x.received(B).length === 1, 'B got the task');
  const task = x.received(B)[0]; assert.equal(task.source.channel, 'local'); assert.equal(task.source.exchange.channel, 'local');
  assert.equal((await b.reply({ from: sids.b, requestId: task.source.exchange.requestId, kind: 'result', text: 'local ok' })).ok, true);
  await until(() => x.received(A).length === 1, 'A got the result');
  assert.equal(x.received(A)[0].source.channel, 'local');
  assert.equal((await x.messages()).length, 0, 'nothing reached the centre');
  const remote = await a.request({ from: sids.a, to: 'carol', text: 'remote review' });
  assert.equal(remote.ok, true, remote.text); assert.equal(remote.requests[0].via, 'hub');
  await until(() => x.received(C).length === 1, 'C got the task');
  const hubTask = x.received(C)[0]; assert.equal(hubTask.source.channel, 'hub'); assert.ok(hubTask.source.hub.messageId);
  assert.equal((await c.reply({ from: sids.c, requestId: hubTask.source.exchange.requestId, kind: 'result', text: 'remote ok' })).ok, true);
  await until(() => x.received(A).length === 2, 'A got the remote result');
  assert.equal(x.received(A)[1].source.channel, 'hub');
  await until(async () => { const m = await x.messages(); return m.length === 2 && m.every(v => v.state === 'consumed'); }, 'both centre messages consumed');
  assert.deepEqual((await x.messages()).map(m => m.exchange.kind).sort(), ['request', 'result']);
});

test('X03 peer_list merges both channels once; this device\'s centre rows are the local ones', async t => {
  const x = await setup(t), a = x.cores.a.core;
  const view = await a.listView(sids.a);
  assert.equal(view.hubOffline, false);
  assert.deepEqual(view.entries.map(e => [e.address, e.via, !!e.self]), [['alice', 'local', true], ['bob', 'local', false], ['carol', 'hub', false]]);
  assert.equal(view.entries.find(e => e.via === 'hub').device, 'vps');
  assert.match(await a.listText(sids.a), /\| carol \| hub \|/);
});

test('X04 duplicate names: the bare name means the local session, name@device the remote one', async t => {
  const x = await setup(t, { names: { a: 'alice', b: 'bob', c: 'bob' } }), a = x.cores.a.core, b = x.cores.b.core, c = x.cores.c.core;
  // The centre keeps names unique: C holds `bob`, so B is `bob-2` there.
  await until(async () => (await x.admin('inspect')).sessions.some(s => s.nativeSession === sids.b && s.name === 'bob-2'), 'B suffixed on the centre');
  const view = await a.listView(sids.a);
  assert.deepEqual(view.entries.map(e => [e.address, e.via]), [['alice', 'local'], ['bob', 'local'], ['bob@vps', 'hub']]);
  assert.equal(view.entries.find(e => e.address === 'bob').hubName, 'bob-2');
  assert.match(await a.listText(sids.a), /\| bob（中心名 bob-2） \| local \|/);
  assert.equal((await a.send({ from: sids.a, to: 'bob', text: 'to the local bob' })).ok, true);
  await until(() => x.received(B).length === 1); assert.equal((await x.messages()).length, 0);
  assert.equal((await a.send({ from: sids.a, to: 'bob@vps', text: 'to the remote bob' })).ok, true);
  await until(() => x.received(C).length === 1); assert.match(x.received(C)[0].content[0].text, /to the remote bob/);
  // From C, B is `bob-2`; B sees C as `bob@vps` (its own name is bob) and answers there.
  assert.equal((await c.send({ from: sids.c, to: 'bob-2', text: 'hello local bob' })).ok, true);
  await until(() => x.received(B).length === 2);
  const incoming = x.received(B)[1];
  assert.equal(incoming.source.channel, 'hub'); assert.equal(incoming.source.peer.name, 'bob@vps'); assert.match(incoming.content[0].text, /to 填 "bob@vps"/);
  assert.equal((await b.send({ from: sids.b, to: incoming.source.peer.name, text: 'reply to remote bob' })).ok, true);
  await until(() => x.received(C).length === 2); assert.match(x.received(C)[1].content[0].text, /reply to remote bob/);
  assert.equal((await a.send({ from: sids.a, to: 'nobody@vps', text: 'x' })).error, 'unknown-peer');
});

test('X05 centre offline: local channel unaffected, peer_list says so, remote recovers', async t => {
  const x = await setup(t), a = x.cores.a.core, b = x.cores.b.core;
  await x.stopHub();
  const view = await a.listView(sids.a);
  assert.equal(view.hubOffline, true); assert.deepEqual(view.entries.map(e => e.address), ['alice', 'bob']);
  assert.match(await a.listText(sids.a), /中心离线/);
  const r = await a.request({ from: sids.a, to: 'bob', text: 'while the centre is down' }); assert.equal(r.ok, true, r.text);
  await until(() => x.received(B).length === 1);
  assert.equal((await b.reply({ from: sids.b, requestId: x.received(B)[0].source.exchange.requestId, kind: 'result', text: 'still works' })).ok, true);
  await until(() => x.received(A).length === 1);
  assert.equal((await a.send({ from: sids.a, to: 'carol', text: 'x' })).error, 'hub-offline');
  await x.startHub();
  await until(async () => (await a.request({ from: sids.a, to: 'carol', text: 'after recovery' })).ok, 'remote request after recovery');
  await until(() => x.received(C).some(m => /after recovery/.test(m.content[0].text)), 'C got it');
});

test('X06 replies go back on the channel each task came on', async t => {
  const x = await setup(t), a = x.cores.a.core, b = x.cores.b.core, c = x.cores.c.core;
  assert.equal((await b.request({ from: sids.b, to: 'alice', text: 'local task' })).ok, true);
  assert.equal((await c.request({ from: sids.c, to: 'alice', text: 'remote task' })).ok, true);
  await until(() => x.received(A).length === 2);
  const local = x.received(A).find(m => m.source.channel === 'local'), remote = x.received(A).find(m => m.source.channel === 'hub');
  assert.equal(local.source.exchange.kind, 'request'); assert.equal(remote.source.exchange.kind, 'request');
  const before = (await x.messages()).length;
  assert.equal((await a.reply({ from: sids.a, requestId: local.source.exchange.requestId, kind: 'result', text: 'local answer' })).ok, true);
  await until(() => x.received(B).length === 1); assert.equal(x.received(B)[0].source.channel, 'local');
  assert.equal((await x.messages()).length, before, 'the local reply did not touch the centre');
  assert.equal((await a.reply({ from: sids.a, requestId: remote.source.exchange.requestId, kind: 'declined', text: 'not mine to do' })).ok, true);
  await until(() => x.received(C).length === 1); assert.equal(x.received(C)[0].source.channel, 'hub'); assert.equal(x.received(C)[0].source.exchange.kind, 'declined');
  await until(async () => (await x.admin('inspect')).requests.some(r => r.state === 'declined'));
  const waits = await a.waitFor({ from: sids.a }); assert.equal(waits.ok, true); assert.equal(waits.wait, false);
});

test('X07 a broken centre configuration never takes the same-machine channel down', async t => {
  const { setup: local, ids } = await import('./helpers.mjs');
  const logs = [];
  const dir = mkdtempSync(join(tmpdir(), 'mixed-broken-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const got = [], agents = { get: id => ({ followup: m => got.push({ id, m }) }) };
  const core = createPeerCore({ dir: join(dir, 'run'), isAlive: () => true, namesFile: join(dir, 'names.json'), agents, log: l => logs.push(l),
    makeMessage: (text, source) => ({ content: [{ type: 'text', text }], source }), hub: { credentialFile: join(dir, 'missing.credential.json') } });
  t.after(() => core.stop());
  assert.equal(core.mode, 'mixed'); assert.match(logs.join('\n'), /中心通道不可用/);
  await core.start();
  core.register({ id: ids.a, cwd: '/tmp/a' }); core.register({ id: ids.b, cwd: '/tmp/b' });
  const r = await core.request({ from: ids.a, to: 'bbbb', text: 'still local' }); assert.equal(r.ok, true, r.text);
  assert.equal(got.length, 1);
  const view = await core.listView(ids.a); assert.equal(view.hubOffline, true); assert.equal(view.entries.length, 2);
  assert.equal((await core.send({ from: ids.a, to: 'someone@far', text: 'x' })).error, 'hub-offline');
  void local;
});
