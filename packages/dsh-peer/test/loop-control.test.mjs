import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup, ids } from './helpers.mjs';
for (const socket of [false, true]) {
  const mode = socket ? 'socket' : 'local';
  test(`G01/G07 ${mode}: new IDs with same content deliver once`, async t => {
    const h = await setup(t, { socket });
    assert.equal((await h.send('收到，谢谢')).ok, true);
    const r = await h.send('收到，谢谢'); assert.equal(r.error, 'duplicate-content');
    assert.equal(h.got.length, 1); assert.doesNotMatch(r.text, /当前列表|已发给/);
  });
  test(`G03/G07 ${mode}: seventh different message rejected`, async t => {
    const h = await setup(t, { socket });
    for (let i = 0; i < 6; i++) assert.equal((await h.send(`item ${i}`)).ok, true);
    const r = await h.send('item 6'); assert.equal(r.error, 'rate-limited');
    assert.equal(h.got.length, 6); assert.equal(r.retryAfterMs, 60000);
  });
  test(`G06/G07 ${mode}: alternating novel replies stop`, async t => {
    const h = await setup(t, { socket }); let stopped = false;
    for (let i = 0; i < 13; i++) {
      h.time(i * 41000); const r = await h.send(`question ${i}`);
      if (!r.ok) { assert.equal(r.error, 'conversation-paused'); stopped = true; break; }
      assert.equal((await h.b.send({ from: ids.b, to: 'aaaa', text: `answer ${i}` })).ok, true);
    }
    assert.equal(stopped, true); assert.equal(h.got.length, 24);
  });
}
test('G02 exact bytes, rename, target/mode isolation and 60 s boundary', async t => {
  const h = await setup(t); await h.send('hello'); h.a.rename(ids.a, 'renamed');
  assert.equal((await h.send('hello')).error, 'duplicate-content');
  assert.equal((await h.send('hello', { to: 'cccc' })).ok, true);
  assert.equal((await h.send('hello', { steer: true })).ok, true);
  assert.equal((await h.send('hello ')).ok, true);
  h.time(59999); assert.equal((await h.send('hello')).error, 'duplicate-content');
  h.time(60000); assert.equal((await h.send('hello')).ok, true);
});
test('G04 20 messages at 5 s intervals: rejected attempts consume no quota', async t => {
  const h = await setup(t); const accepted = [];
  for (let i = 0; i < 20; i++) {
    h.time(i * 5000); const r = await h.send(`different ${i}`);
    if (r.ok) accepted.push(i * 5000); else assert.ok(['rate-limited', 'conversation-paused'].includes(r.error));
  }
  assert.equal(accepted.length, 12);
  for (const n of accepted) assert.ok(accepted.filter(x => x <= n && n - x < 60000).length <= 6);
  assert.equal(h.got.length, 12);
});
test('G05/G08/G09/G12 pause survives time/rename/steer/text commands; user resume directional', async t => {
  const h = await setup(t);
  for (let i = 0; i < 12; i++) { h.time(i * 41000); await h.send(`item ${i}`); }
  h.time(492000); assert.equal((await h.send('thirteenth')).error, 'conversation-paused');
  h.time(9000000); h.a.rename(ids.a, 'new-name');
  assert.equal((await h.send('/peer-resume new-name', { steer: true })).error, 'conversation-paused');
  assert.equal(h.got.length, 12);
  assert.equal((await h.send('other sender', { from: ids.c })).ok, true);
  const before = h.got.length; assert.equal(h.b.resume(ids.b, 'new-name').ok, true);
  assert.equal(h.got.length, before); assert.equal(h.b.resume(ids.b, 'new-name').ok, true);
  assert.equal((await h.send('after user recovery')).ok, true);
  assert.ok(h.logs.every(l => !l.includes('item ') && !l.includes('thirteenth')));
  assert.equal(h.logs.filter(l => l.includes('conversation-paused')).length, 1);
});
test('G10 scoped IDs and synchronous failure rollback', async t => {
  const h = await setup(t);
  h.hooks.set(ids.b, () => { throw new Error('private body must not leak'); });
  assert.equal(h.receive(h.raw()).ok, false); h.hooks.delete(ids.b);
  assert.equal(h.receive(h.raw()).delivered, 'queued');
  assert.equal(h.receive(h.raw()).delivered, 'duplicate');
  assert.equal(h.receive(h.raw({ from: { session: ids.c, name: 'gamma' } })).delivered, 'queued');
  assert.equal(h.got.length, 2); assert.ok(h.logs.every(l => !l.includes('private body')));
});
test('G11 concurrent sends do not over-admit', async t => {
  const h = await setup(t, { socket: true });
  const results = await Promise.all(Array.from({ length: 20 }, (_, i) => h.send(`parallel ${i}`)));
  assert.equal(results.filter(r => r.ok).length, 6); assert.equal(h.got.length, 6);
});
test('G11 capacity refuses new pair without evicting pause', async t => {
  const h = await setup(t, { guardOptions: { maxPairs: 1 } });
  for (let i = 0; i < 12; i++) { h.time(i * 41000); await h.send(`item ${i}`); }
  h.time(492000); assert.equal((await h.send('lock')).error, 'conversation-paused'); h.time(9000000);
  assert.equal((await h.send('new pair', { from: ids.c })).error, 'guard-capacity');
  assert.equal((await h.send('still locked')).error, 'conversation-paused'); assert.equal(h.got.length, 12);
});
