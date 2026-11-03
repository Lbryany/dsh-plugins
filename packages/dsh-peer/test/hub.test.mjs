import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setup(t, options = {}) {
  const { createHubServer } = await import('../lib/hub/server.js');
  const dir = mkdtempSync(join(tmpdir(), 'peer-hub-test-'));
  let now = 100000;
  let hub = createHubServer({ dir, port: 0, now: () => now, ...options });
  await hub.start();
  t.after(async () => { await hub.stop(); rmSync(dir, { recursive: true, force: true }); });
  const call = async (credential, op, args = {}, generation = 'g1') => {
    const response = await fetch(hub.url + '/v1/rpc', { method: 'POST', headers: {
      authorization: `Bearer ${credential}`, 'content-type': 'application/json', 'x-peer-generation': generation,
    }, body: JSON.stringify({ op, args }) });
    return { status: response.status, ...await response.json() };
  };
  const admin = (op, args) => call(hub.adminToken, op, args);
  const device = async (name, workspace = 'default') => {
    const minted = await admin('device.create', { name, workspace }); assert.equal(minted.ok, true);
    const c = (op, args, generation) => call(minted.credential.token, op, args, generation);
    assert.equal((await c('connect', {})).ok, true);
    return { call: c, credential: minted.credential, register: async (sessions, generation) => c('sessions.sync', { sessions }, generation) };
  };
  const a = await device('machine-a'), b = await device('machine-b');
  await a.register([{ id: 'session-aaaa', name: 'alice', runtime: 'dsh', status: 'idle' }]);
  await b.register([{ id: 'session-bbbb', name: 'reviewer', runtime: 'dsh', status: 'idle' }]);
  const send = (text, extra = {}) => a.call('send', { from: 'session-aaaa', to: 'reviewer', text, operationId: text, ...extra });
  return { dir, a, b, send, admin, device, call, get hub() { return hub; }, time: value => { now = value; },
    async restart() { await hub.stop(); hub = createHubServer({ dir, port: 0, now: () => now, ...options }); await hub.start(); } };
}

test('H01 authenticated identity, unique names and workspace isolation', async t => {
  const x = await setup(t);
  const c = await x.device('third');
  const reg = await c.register([{ id: 'session-cccc', name: 'reviewer', runtime: 'dsh' }]);
  assert.equal(reg.sessions[0].name, 'reviewer-2');
  const list = await x.a.call('sessions.list', {}); assert.equal(list.sessions.length, 3);
  const wrong = await x.a.call('send', { from: 'session-bbbb', to: 'reviewer', text: 'spoof', operationId: 'spoof' });
  assert.equal(wrong.error, 'not-registered');
  const foreign = await x.device('other-team', 'other');
  await foreign.register([{ id: 'session-aaaa', name: 'alice', runtime: 'dsh' }]);
  assert.equal((await foreign.call('sessions.list', {})).sessions.length, 1);
  assert.equal((await foreign.call('send', { from: 'session-aaaa', to: 'reviewer', text: 'x', operationId: 'x' })).error, 'unknown-peer');
  assert.equal((await x.a.call('device.create', { name: 'unauthorized' })).status, 403);
});

test('H02 durable inbox, idempotent sends and explicit receipts survive centre restart', async t => {
  const x = await setup(t);
  const first = await x.send('hello'); assert.equal(first.ok, true); assert.equal(first.delivered, 'accepted');
  assert.equal((await x.send('hello')).messageId, first.messageId);
  assert.equal((await x.send('changed', { operationId: 'hello' })).error, 'idempotency-conflict');
  await x.restart();
  const claimed = await x.b.call('inbox.claim', { from: 'session-bbbb' });
  assert.equal(claimed.messages.length, 1); const m = claimed.messages[0];
  assert.equal(m.text, 'hello'); assert.equal(m.from.name, 'alice');
  assert.equal((await x.admin('inspect', {})).messages[0].state, 'claimed');
  await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'delivered' });
  assert.equal((await x.b.call('inbox.claim', { from: 'session-bbbb' })).messages.length, 0);
  await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'consumed' });
  assert.equal((await x.admin('inspect', {})).messages[0].state, 'consumed');
  assert.equal((await x.a.call('inbox.ack', { from: 'session-aaaa', messageId: m.id, claimToken: m.claimToken, stage: 'consumed' })).error, 'forbidden');
});

async function consume(device, from) {
  const r = await device.call('inbox.claim', { from }); assert.equal(r.ok, true);
  for (const m of r.messages) assert.equal((await device.call('inbox.ack', { from, messageId: m.id, claimToken: m.claimToken, stage: 'consumed' })).ok, true);
  return r.messages;
}

test('H03 central request/question/answer/result ownership and consumption', async t => {
  const x = await setup(t);
  const r = await x.a.call('request', { from: 'session-aaaa', to: 'reviewer', text: 'review', operationId: 'task' });
  assert.equal(r.ok, true); assert.equal(r.wait, true); const requestId = r.requests[0].requestId;
  assert.equal((await x.a.call('request', { from: 'session-aaaa', to: 'reviewer', text: 'another', operationId: 'second' })).error, 'request-pending');
  assert.equal((await x.a.call('reply', { from: 'session-aaaa', requestId, kind: 'result', text: 'spoof', operationId: 'spoof' })).error, 'invalid-reply-state');
  await consume(x.b, 'session-bbbb');
  const q = await x.b.call('reply', { from: 'session-bbbb', requestId, kind: 'question', text: 'which branch?', operationId: 'question' });
  assert.equal(q.ok, true);
  const [question] = await consume(x.a, 'session-aaaa');
  assert.equal((await x.a.call('reply', { from: 'session-aaaa', requestId, kind: 'answer', questionId: 'wrong', text: 'main', operationId: 'wrong' })).error, 'invalid-reply-state');
  assert.equal((await x.a.call('reply', { from: 'session-aaaa', requestId, kind: 'answer', questionId: question.exchange.questionId, text: 'main', operationId: 'answer' })).ok, true);
  await consume(x.b, 'session-bbbb');
  assert.equal((await x.b.call('reply', { from: 'session-bbbb', requestId, kind: 'result', text: 'done', operationId: 'result' })).ok, true);
  assert.equal((await x.b.call('reply', { from: 'session-bbbb', requestId, kind: 'result', text: 'done', operationId: 'result-again' })).duplicate, true);
  assert.equal((await x.a.call('request', { from: 'session-aaaa', to: 'reviewer', text: 'next', operationId: 'next-before' })).error, 'request-pending');
  await consume(x.a, 'session-aaaa');
  assert.equal((await x.a.call('wait', { from: 'session-aaaa' })).wait, false);
  assert.equal((await x.a.call('request', { from: 'session-aaaa', to: 'reviewer', text: 'next', operationId: 'next-after' })).ok, true);
});

test('H04 offline queue, generation fencing and uncertain claim recovery', async t => {
  const x = await setup(t);
  await x.b.call('disconnect', {});
  assert.equal((await x.send('offline')).ok, true);
  assert.equal((await x.b.call('connect', {}, 'g2')).ok, true);
  await x.b.register([{ id: 'session-bbbb', name: 'reviewer', runtime: 'dsh' }], 'g2');
  assert.equal((await x.b.call('inbox.claim', { from: 'session-bbbb' }, 'g1')).error, 'stale-generation');
  const [m] = (await x.b.call('inbox.claim', { from: 'session-bbbb' }, 'g2')).messages;
  assert.equal(m.recovery, false);
  await x.restart();
  const [again] = (await x.b.call('inbox.claim', { from: 'session-bbbb' }, 'g2')).messages;
  assert.equal(again.id, m.id); assert.equal(again.recovery, true);
  await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: again.claimToken, stage: 'unknown' }, 'g2');
  assert.equal((await x.admin('inspect', {})).messages[0].state, 'unknown');
  await x.b.register([{ id: 'session-new', name: 'reviewer', runtime: 'dsh' }], 'g2');
  assert.equal((await x.b.call('inbox.claim', { from: 'session-new' }, 'g2')).messages.length, 0);
});

test('H05 durable pause, shared task budget and deadline cannot reset on restart', async t => {
  const x = await setup(t, { limits: { shortLimit: 2, longLimit: 2, rootMessages: 3, rootDepth: 1 } });
  assert.equal((await x.send('one')).ok, true); assert.equal((await x.send('two')).ok, true);
  assert.equal((await x.send('three')).error, 'conversation-paused');
  await x.restart();
  assert.equal((await x.send('four')).error, 'conversation-paused');
  const list = (await x.a.call('sessions.list', {})).sessions;
  const a = list.find(s => s.name === 'alice'), b = list.find(s => s.name === 'reviewer');
  assert.equal((await x.admin('resume', { from: a.session, to: b.session })).ok, true);
  const r = await x.a.call('request', { from: 'session-aaaa', to: 'reviewer', text: 'root', operationId: 'root' }); assert.equal(r.ok, true);
  await consume(x.b, 'session-bbbb');
  const c = await x.device('third'); await c.register([{ id: 'session-cccc', name: 'third', runtime: 'dsh' }]);
  const sub = await x.b.call('request', { from: 'session-bbbb', to: 'third', text: 'child', operationId: 'child' }); assert.equal(sub.ok, true);
  await consume(c, 'session-cccc');
  assert.equal((await c.call('request', { from: 'session-cccc', to: 'alice', text: 'grandchild', operationId: 'grandchild' })).error, 'root-depth');
  await x.restart();
  assert.equal((await c.call('reply', { from: 'session-cccc', requestId: sub.requests[0].requestId, kind: 'result', text: 'child done', operationId: 'child-result' })).ok, true);
  assert.equal((await x.b.call('reply', { from: 'session-bbbb', requestId: r.requests[0].requestId, kind: 'result', text: 'root done', operationId: 'root-result' })).error, 'root-budget');
  x.time(100000 + 600001);
  await x.b.call('connect', {}); await x.b.register([{ id: 'session-bbbb', name: 'reviewer', runtime: 'dsh' }]);
  assert.equal((await x.b.call('reply', { from: 'session-bbbb', requestId: r.requests[0].requestId, kind: 'result', text: 'late', operationId: 'late' })).error, 'request-expired');
});

test('H06 authentication, revocation, bounded input and local-only listeners', async t => {
  const x = await setup(t);
  assert.equal((await x.call('wrong', 'inspect', {})).status, 401);
  const foreignOrigin = await fetch(x.hub.url + '/v1/rpc', { method: 'POST', headers: { origin: 'https://evil.invalid', authorization: `Bearer ${x.hub.adminToken}`, 'content-type': 'application/json' }, body: '{"op":"inspect","args":{}}' });
  assert.equal(foreignOrigin.status, 403);
  const large = await fetch(x.hub.url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${x.a.credential.token}`, 'content-type': 'application/json' }, body: 'x'.repeat(65537) });
  assert.equal(large.status, 413);
  assert.equal((await x.admin('device.revoke', { deviceId: x.a.credential.deviceId })).ok, true);
  assert.equal((await x.a.call('sessions.list', {})).status, 401);
  const { createHubServer } = await import('../lib/hub/server.js');
  assert.throws(() => createHubServer({ dir: x.dir, host: '0.0.0.0' }), /loopback/i);
});

test('H11 retrying a lost claim response replays the original admission', async t => {
  const x = await setup(t); await x.send('claim retry');
  const args = { from: 'session-bbbb', operationId: 'stable-claim-id' };
  const first = await x.b.call('inbox.claim', args);
  const retried = await x.b.call('inbox.claim', args);
  assert.equal(first.messages[0].recovery, false);
  assert.deepEqual(retried, first, 'a dropped HTTP reply must not turn a fresh delivery into unknown');
});

test('H12 unknown receipts cannot starve later queued messages', async t => {
  const x = await setup(t, { limits: { shortLimit: 40, longLimit: 40 } });
  for (let n = 0; n < 16; n++) await x.send('unknown-' + n);
  const claim = await x.b.call('inbox.claim', { from: 'session-bbbb' });
  for (const m of claim.messages) await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'unknown' });
  await x.send('fresh');
  assert.ok((await x.b.call('inbox.claim', { from: 'session-bbbb' })).messages.some(m => m.text === 'fresh' && !m.recovery));
});

test('H15 names and workspaces reject coerced non-string values', async t => {
  const x = await setup(t);
  for (const name of [undefined, null, 123, true]) {
    assert.equal((await x.a.register([{ id: 'poison', name, runtime: 'dsh' }])).ok, false);
    assert.equal((await x.a.call('rename', { from: 'session-aaaa', name })).ok, false);
    assert.equal((await x.admin('device.create', { name })).ok, false);
  }
  for (const workspace of [null, 0, true]) assert.equal((await x.admin('device.create', { name: 'new-device', workspace })).ok, false);
  assert.equal((await x.a.call('sessions.list')).sessions.every(s => typeof s.name === 'string'), true);
});

test('H16 a completed interleaved task cannot mint a fresh budget for still-open work', async t => {
  const x = await setup(t), c = await x.device('third'), d = await x.device('fourth');
  await c.register([{ id: 'session-cccc', name: 'third', runtime: 'dsh' }]);
  await d.register([{ id: 'session-dddd', name: 'fourth', runtime: 'dsh' }]);
  const taskA = await x.a.call('request', { from: 'session-aaaa', to: 'reviewer', text: 'A work', operationId: 'A' });
  await consume(x.b, 'session-bbbb');
  const taskD = await d.call('request', { from: 'session-dddd', to: 'reviewer', text: 'D work', operationId: 'D' });
  await consume(x.b, 'session-bbbb');
  await x.b.call('reply', { from: 'session-bbbb', requestId: taskD.requests[0].requestId, kind: 'result', text: 'D done', operationId: 'D-done' });
  await consume(d, 'session-dddd');
  const child = await x.b.call('request', { from: 'session-bbbb', to: 'third', text: 'continue A', operationId: 'child-A' });
  assert.equal(child.ok, true);
  assert.equal(child.requests[0].rootId, taskA.requests[0].rootId);
  const invalid = await c.call('request', { from: 'session-cccc', to: 'fourth', text: 'forge parent', parentRequestId: taskA.requests[0].requestId, operationId: 'forged-parent' });
  assert.equal(invalid.error, 'invalid-parent');
});

test('H17 claim replay is fenced by connection generation', async t => {
  const x = await setup(t); await x.send('old generation');
  const args = { from: 'session-bbbb', operationId: 'claim-id' };
  assert.equal((await x.b.call('inbox.claim', args)).messages[0].recovery, false);
  await x.b.call('disconnect'); await x.b.call('connect', {}, 'g2');
  await x.b.register([{ id: 'session-bbbb', name: 'reviewer', runtime: 'dsh' }], 'g2');
  const next = (await x.b.call('inbox.claim', args, 'g2')).messages[0];
  assert.equal(next.recovery, true); assert.equal(next.claimGeneration, 'g2');
});

test('H18 repeated unknown-receipt reconciliation cannot exhaust send capacity', async t => {
  const x = await setup(t, { limits: { maxMessages: 2 } }); await x.send('uncertain');
  for (let n = 0; n < 12; n++) {
    const r = await x.b.call('inbox.claim', { from: 'session-bbbb', operationId: 'claim-' + n });
    assert.equal(r.ok, true, r.error); const m = r.messages[0];
    await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'unknown' });
  }
  assert.equal((await x.send('new work')).ok, true);
});

test('H20 a new authenticated generation can confirm a durable native receipt', async t => {
  const x = await setup(t); await x.send('persisted inbox');
  const [m] = (await x.b.call('inbox.claim', { from: 'session-bbbb' })).messages;
  await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'delivered' });
  await x.b.call('disconnect'); await x.b.call('connect', {}, 'g2');
  await x.b.register([{ id: 'session-bbbb', name: 'reviewer', runtime: 'dsh' }], 'g2');
  assert.equal((await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'consumed' }, 'g2')).ok, true);
  assert.equal((await x.b.call('inbox.ack', { from: 'session-bbbb', messageId: m.id, claimToken: m.claimToken, stage: 'consumed' }, 'g1')).error, 'stale-generation');
});
