import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
const { createPeerCore } = await import(process.env.PEER_HUB_BASELINE ? pathToFileURL(join(process.env.PEER_HUB_BASELINE, 'lib/core.js')) : new URL('../lib/core.js', import.meta.url));
import { createHubServer } from '../lib/hub/server.js';
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function until(check) { for (let i = 0; i < 100; i++) { if (await check()) return; await sleep(25); } assert.fail('condition timed out'); }

async function setup(t) {
  const dir = mkdtempSync(join(tmpdir(), 'hub-core-'));
  let hub = createHubServer({ dir: join(dir, 'centre'), port: 0 }); await hub.start();
  const cores = [], got = [], history = new Map();
  const admin = async (op, args = {}) => (await fetch(hub.url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${hub.adminToken}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args }) })).json();
  async function make(name, sid, start = true) {
    const minted = await admin('device.create', { name });
    const root = join(dir, name); mkdirSync(root);
    const credentialFile = join(root, 'credential.json');
    writeFileSync(credentialFile, JSON.stringify({ ...minted.credential, url: hub.url }), { mode: 0o600 });
    const received = []; history.set(sid, received);
    const agent = { session: { deriveMessages: () => received }, inbox: { nextTurn: [], nextStep: [] }, followup(m) { received.push(m); got.push({ sid, m }); core.consume(sid, m.source); } };
    const core = createPeerCore({ dir: join(root, 'unshared-registry'), namesFile: join(root, 'names.json'), fixedName: name,
      agents: { get: id => id === sid ? agent : undefined }, makeMessage: (text, source) => ({ content: [{ type: 'text', text }], source }),
      persistMessage: async () => true, hub: { credentialFile, stateDir: join(root, 'receipts'), heartbeatMs: 100 } });
    cores.push(core); core.register({ id: sid, cwd: root }); if (start) await core.start();
    return { core, sid, root, agent };
  }
  t.after(async () => { for (const c of cores) await c.stop(); await hub.stop(); rmSync(dir, { recursive: true, force: true }); });
  return { make, got, admin, history, pause: () => hub.stop(), async restart() { const port = Number(new URL(hub.url).port); await hub.stop(); hub = createHubServer({ dir: join(dir, 'centre'), port }); await hub.start(); } };
}

test('H07 isolated dsh cores discover and exchange only through the centre', async t => {
  const x = await setup(t), a = await x.make('alice', 'session-aaaa'), b = await x.make('reviewer', 'session-bbbb');
  assert.equal(a.core.mode, 'hub');
  const list = await a.core.list(a.sid); assert.ok(list.some(s => s.name === 'reviewer'));
  const r = await a.core.request({ from: a.sid, to: 'reviewer', text: 'check this' }); assert.equal(r.ok, true);
  await until(() => x.got.length === 1);
  const source = x.got[0].m.source;
  assert.equal(source.peer.name, 'alice'); assert.equal(source.display.to, b.sid);
  assert.equal((await b.core.reply({ from: b.sid, requestId: source.exchange.requestId, kind: 'result', text: 'checked' })).ok, true);
  await until(() => x.got.length === 2);
  assert.equal((await a.core.waitFor({ from: a.sid })).wait, false);
  assert.equal((await x.admin('inspect')).messages.filter(m => m.state === 'consumed').length, 2);
});

test('H08 stream reconnect delivers offline messages once and preserves durable receipts', async t => {
  const x = await setup(t), a = await x.make('alice', 'session-aaaa'), b = await x.make('reviewer', 'session-bbbb');
  await b.core.stop();
  assert.equal((await a.core.send({ from: a.sid, to: 'reviewer', text: 'offline work' })).ok, true);
  assert.equal(x.got.length, 0);
  await x.restart(); await b.core.start();
  await until(() => x.got.length === 1);
  await x.restart(); await sleep(700);
  assert.equal(x.got.length, 1);
  assert.equal((await x.admin('inspect')).messages[0].state, 'consumed');
});

test('H13 consuming old local peer metadata is harmless in hub mode', async t => {
  const x = await setup(t), a = await x.make('alice', 'session-aaaa');
  assert.doesNotThrow(() => a.core.consume(a.sid, { kind: 'dsh-peer', peer: { name: 'reviewer' }, display: { version: 1 } }));
});

test('H14 a host starting before its centre automatically reconnects', async t => {
  const x = await setup(t), a = await x.make('alice', 'session-aaaa', false);
  await x.pause();
  const start = a.core.start().then(() => true, error => error);
  await sleep(300); await x.restart();
  assert.equal(await start, true);
  assert.equal((await x.admin('inspect')).sessions.length, 1);
});

test('H21 native history repairs a lost consumption event after delivery acknowledgement', async t => {
  const x = await setup(t), a = await x.make('alice', 'session-aaaa'), b = await x.make('reviewer', 'session-bbbb');
  b.agent.followup = m => b.agent.inbox.nextTurn.push(m);
  await a.core.send({ from: a.sid, to: 'reviewer', text: 'history repair' });
  await until(async () => (await x.admin('inspect')).messages[0]?.state === 'delivered');
  const m = b.agent.inbox.nextTurn.shift(); x.history.get(b.sid).push(m);
  // Native consumption was persisted, but plugin callback/process was lost.
  await b.core.stop(); await b.core.start();
  await until(async () => (await x.admin('inspect')).messages[0]?.state === 'consumed');
});

test('H22 a late delivered ACK cannot erase locally observed consumption', async t => {
  const x = await setup(t), a = await x.make('alice', 'session-aaaa'), b = await x.make('reviewer', 'session-bbbb');
  b.agent.followup = m => b.agent.inbox.nextTurn.push(m);
  const original = b.core.client.rpc; let release, pending = false, failed = false;
  b.core.client.rpc = async (op, args) => {
    if (op === 'inbox.ack' && args.stage === 'delivered' && !pending) {
      const r = await original(op, args); pending = true;
      return new Promise(resolve => { release = () => resolve(r); });
    }
    if (op === 'inbox.ack' && args.stage === 'consumed' && !failed) { failed = true; return { ok: false, error: 'hub-unreachable' }; }
    return original(op, args);
  };
  await a.core.send({ from: a.sid, to: 'reviewer', text: 'receipt race' });
  await until(() => pending);
  const m = b.agent.inbox.nextTurn.shift(); x.history.get(b.sid).push(m); b.core.consume(b.sid, m.source);
  await until(() => failed); release();
  await until(async () => (await x.admin('inspect')).messages[0]?.state === 'consumed');
});
