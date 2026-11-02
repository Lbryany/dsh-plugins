import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './helpers.mjs';
test('UI01/UI04 receive metadata identifies exact original Unicode body', async t => {
  const h = await setup(t); const original = '首行😀\n第二行\n```js\nconst x = 1;\n```';
  await h.send(original); const m = h.got[0].m, range = m.source.display;
  assert.equal(range?.version, 1);
  assert.equal(m.content[0].text.slice(range.start, range.end), original);
  assert.ok(range.id); assert.ok(range.to);
});
test('UI02 tool result carries structured outcome; uncertainty is not failure', async t => {
  const h = await setup(t, { socket: true });
  const r = await h.send('report'); assert.equal(r.display?.outcome, 'queued');
  assert.equal(r.display.target.name, 'beta-bbbb');
  h.a.transport.send = async () => ({ ok: false, error: 'timeout' });
  const timeout = await h.send('other'); assert.equal(timeout.display?.outcome, 'unknown');
  assert.match(timeout.text, /投递状态未知/); assert.doesNotMatch(timeout.text, /当前列表/);
});
test('UI06 structured result preserves title text and has a terminal role instruction',async t=>{
 const f=await setup(t),r=await f.a.request({from:'session-aaaa-1111',requests:[{to:'bbbb',text:'review'}]});
 await f.b.reply({from:'session-bbbb-2222',requestId:r.requests[0].requestId,kind:'result',text:'结论😀\n新增证据'});
 const m=f.got.at(-1).m,d=m.source.display;
 assert.equal(d.version,2);assert.equal(m.content[0].text.slice(d.start,d.end),'结论😀\n新增证据');
 assert.match(m.content[0].text,/此请求已完成，禁止再对此 ID 调用 peer_reply/);
 assert.match(m.content[0].text,/每项必填 to/);
});
