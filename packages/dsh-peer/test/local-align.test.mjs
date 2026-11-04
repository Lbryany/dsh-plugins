// Same-machine channel aligned with the centre: declined, expiry notices and
// the task-chain budget/depth (both socket and same-process delivery).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ids } from './helpers.mjs';
const last = (f, id) => f.got.filter(g => g.id === id).at(-1)?.m;
const consume = (core, id, m) => core.consume(id, m.source);

for (const socket of [false, true]) {
  const mode = socket ? 'socket' : 'local';
  test(`L01 ${mode}: declined ends the task for both sides and frees the direction`, async t => {
    const f = await setup(t, { socket });
    const r = await f.a.request({ from: ids.a, to: 'bbbb', text: '删除生产库' }); assert.equal(r.ok, true);
    const id = r.requests[0].requestId, task = last(f, ids.b);
    assert.match(task.content[0].text, /不能或不该做时用 declined 写明原因/); assert.equal(task.source.exchange.channel, 'local');
    consume(f.b, ids.b, task);
    const d = await f.b.reply({ from: ids.b, requestId: id, kind: 'declined', text: '超出授权范围' }); assert.equal(d.ok, true, d.text);
    const back = last(f, ids.a);
    assert.equal(back.source.exchange.kind, 'declined'); assert.match(back.content[0].text, /^\[peer 拒绝\] 来自 @beta-bbbb\n超出授权范围/);
    assert.match(back.content[0].text, /禁止再对此 ID 调用 peer_reply/);
    assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'declined', text: '超出授权范围' })).duplicate, true);
    assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'result', text: 'late result' })).error, 'invalid-reply-state', 'the responder task is cancelled');
    assert.equal((await f.a.request({ from: ids.a, to: 'bbbb', text: 'next' })).error, 'request-pending', 'until the requester reads the decline');
    consume(f.a, ids.a, back);
    assert.equal(f.a.waitFor({ from: ids.a }).wait, false);
    assert.equal((await f.a.request({ from: ids.a, to: 'bbbb', text: 'next' })).ok, true, 'direction released');
  });
}

test('L02 a question can be answered with declined; declined is never a requester kind', async t => {
  const f = await setup(t);
  const id = (await f.a.request({ from: ids.a, to: 'bbbb', text: 'task' })).requests[0].requestId;
  assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'question', text: 'which?' })).ok, true);
  assert.equal((await f.a.reply({ from: ids.a, requestId: id, kind: 'declined', text: 'no' })).error, 'invalid-reply-state');
  assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'declined', text: 'cannot wait for that' })).ok, true);
  assert.equal(last(f, ids.a).source.exchange.kind, 'declined');
});

test('L03 an expired task notifies the requester and late replies get request-expired', async t => {
  const f = await setup(t, { socket: true });
  const id = (await f.a.request({ from: ids.a, to: 'bbbb', text: 'slow task' })).requests[0].requestId;
  const n = f.got.length;
  f.time(600001); f.a.waitFor({ from: ids.a });
  const notice = f.got.slice(n).find(g => g.id === ids.a)?.m;
  assert.ok(notice, 'requester notified');
  assert.equal(notice.source.exchange.kind, 'expired'); assert.equal(notice.source.system, true);
  assert.match(notice.content[0].text, /^\[peer 过期通知\] 来自 @beta-bbbb\n\[dsh-peer 通知\] 任务 .* 已过期/);
  assert.match(notice.content[0].text, /已接收但没有交付结果/);
  assert.equal(notice.content[0].text.slice(notice.source.display.start, notice.source.display.end).startsWith('[dsh-peer 通知]'), true);
  assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'result', text: 'late' })).error, 'request-expired');
  assert.equal(f.got.length, n + 1, 'exactly one notice, nothing reached the responder');
  f.a.waitFor({ from: ids.a }); assert.equal(f.got.length, n + 1, 'notified once');
  assert.equal((await f.a.request({ from: ids.a, to: 'bbbb', text: 'retry later' })).ok, true, 'an expired task no longer blocks the direction');
});

test('L04 task-chain depth and parent inheritance', async t => {
  const f = await setup(t, { exchangeLimits: { rootDepth: 1 } });
  const root = await f.a.request({ from: ids.a, to: 'bbbb', text: 'root' });
  consume(f.a, ids.b, last(f, ids.b));
  // b delegates while working on the root task: depth 1, same deadline.
  const child = await f.a.request({ from: ids.b, to: 'cccc', text: 'child' }); assert.equal(child.ok, true, child.text);
  consume(f.a, ids.c, last(f, ids.c));
  assert.equal((await f.a.request({ from: ids.c, to: 'aaaa', text: 'grandchild' })).error, 'root-depth');
  assert.equal((await f.a.request({ from: ids.c, to: 'aaaa', text: 'forged', parentRequestId: root.requests[0].requestId })).error, 'invalid-parent');
});

test('L05 the shared chain budget stops a loop; a refusal still goes through', async t => {
  const f = await setup(t, { exchangeLimits: { rootMessages: 3 } });
  const id = (await f.a.request({ from: ids.a, to: 'bbbb', text: 'root' })).requests[0].requestId; // 1
  const q = await f.b.reply({ from: ids.b, requestId: id, kind: 'question', text: 'q1' }); assert.equal(q.ok, true); // 2
  assert.equal((await f.a.reply({ from: ids.a, requestId: id, kind: 'answer', questionId: q.questionId, text: 'a1' })).ok, true); // 3
  assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'result', text: 'done' })).error, 'root-budget');
  assert.equal((await f.b.reply({ from: ids.b, requestId: id, kind: 'declined', text: 'budget exhausted' })).ok, true);
});

test('L06 the budget travels with the packet between processes', async t => {
  const f = await setup(t, { socket: true, exchangeLimits: { rootMessages: 2 } });
  const id = (await f.a.request({ from: ids.a, to: 'bbbb', text: 'root' })).requests[0].requestId;
  const q = await f.b.reply({ from: ids.b, requestId: id, kind: 'question', text: 'q1' }); assert.equal(q.ok, true);
  assert.equal((await f.a.reply({ from: ids.a, requestId: id, kind: 'answer', questionId: q.questionId, text: 'a1' })).error, 'root-budget', 'the requester process learned the count from the packet');
});
