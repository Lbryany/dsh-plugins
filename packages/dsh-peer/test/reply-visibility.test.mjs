import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { createPeerClient } from '../src/client.js';

const client = createPeerClient(React);
const body = '已检查😀\n```js\nconst value = "<script>unsafe</script>";\n```\n第二项证据';
const args = { requestId: 'request-1', kind: 'result', text: body };
const meta = { peerExchange: { action: 'peer_reply', ok: true, wait: true } };
const receipt = 'result 已受理；本轮已交接。';
const call = (extra = {}) => ({ type: 'tool/call', seq: 10, time: 1700000000000,
  data: { turn: 2, step: 1, callId: 'reply-1', name: 'peer_reply', arguments: JSON.stringify(args), ...extra } });
const result = (extra = {}) => ({ type: 'tool/result', seq: 11, time: 1700000000001, surfaceOp: 'append',
  data: { turn: 2, step: 1, message: { toolCallId: 'reply-1', content: [{ type: 'text', text: receipt }], isError: false }, meta, ...extra } });
const location = { kind: 'step', turn: { turn: 2 }, step: { step: 1 } };
function project(c = call(), r = result()) {
  const d = client.replyDefinition;
  assert.ok(d, 'peer_reply must have a dedicated visible chat projection');
  const match = { ...d.match(c), event: c, location };
  let state = d.start({}, match);
  const context = { state, key: 'reply-key', id: match.id, start: match, matches: [match] };
  assert.equal(d.buildViewNode(context), null, 'no accepted card while the call is in progress');
  const update = { ...d.match(r), event: r, location };
  state = d.update(context, update);
  return d.buildViewNode({ ...context, state, matches: [match, update] });
}
function html(node) { return renderToStaticMarkup(React.createElement(client.PeerReplyCard, { node })); }

test('RV01 tool detail exposes the original reply, identifiers and receipt', () => {
  const block = { name: 'peer_reply', args: { string: key => args[key] }, content: [{type:'text',text:receipt}], meta };
  const markup = renderToStaticMarkup(React.createElement(client.PeerExchangeResult, {block,phase:'result'}));
  const dom = new JSDOM(markup);
  assert.ok(dom.window.document.body.textContent.includes(body), 'the reply text is not the transport receipt');
  assert.ok(dom.window.document.body.textContent.includes(args.requestId));
  assert.ok(dom.window.document.body.textContent.includes(receipt));
  assert.equal(dom.window.document.querySelector('script'), null);
  dom.window.close();
});

test('RV05 native Host tool-result keeps arguments on block.call.argsRaw', () => {
  for (const block of [
    {kind:'tool-result',call:{name:'peer_reply',argsRaw:JSON.stringify(args)},content:[{type:'text',text:receipt}],meta},
    {phase:'start',name:'peer_reply',argsRaw:JSON.stringify(args)},
  ]) {
    const markup = renderToStaticMarkup(React.createElement(client.PeerExchangeResult,{block,phase:block.kind?'result':'start'}));
    const dom = new JSDOM(markup);
    assert.ok(dom.window.document.body.textContent.includes(body));
    dom.window.close();
  }
});

test('RV02 a settled reply is visible outside native process folding without claiming native events', () => {
  const node = project();
  assert.equal(node.groupTree, 'turn');
  assert.equal(node.visibility, 'visible');
  assert.equal(node.anchorSeq, 11);
  assert.equal(node.location, location);
  assert.notEqual(client.replyDefinition.match(call()).exclusive, true);
  assert.notEqual(client.replyDefinition.match(result()).exclusive, true);
  const dom = new JSDOM(html(node));
  const card = dom.window.document.querySelector('[data-peer-reply]');
  assert.ok(card);
  const visibleBody = card.querySelector('[data-peer-reply-body]');
  assert.equal(visibleBody.textContent, body);
  assert.equal(visibleBody.closest('details:not([open])'), null, 'reply is visible without a click');
  assert.ok(card.textContent.includes('已受理'));
  dom.window.close();
});

test('RV03 reply kinds and failure/missing metadata remain truthful; malformed and unrelated records do not project', () => {
  for (const kind of ['question','answer','result','declined']) {
    const node = project(call({arguments:JSON.stringify({...args,kind})}));
    assert.ok(html(node).includes('data-peer-reply'));
  }
  for (const changes of [{meta:null}, {meta:{peerExchange:{action:'peer_reply',ok:false,wait:false}}},
    {message:{toolCallId:'reply-1',content:[{type:'text',text:'发送状态未知'}],isError:true}},
    {meta:{peerExchange:{action:'peer_request',ok:true,wait:true}}}]) {
    const markup = html(project(call(), result(changes)));
    const dom = new JSDOM(markup);
    assert.ok(!dom.window.document.querySelector('.dsh-peer-status').textContent.includes('已受理'));
    assert.ok(dom.window.document.querySelector('[data-peer-reply-body]').textContent.includes(body));
    dom.window.close();
  }
  const d = client.replyDefinition;
  for (const e of [call({name:'peer_request'}), {type:'assistant/message',data:{}}, {...result(),surfaceOp:'replace'}]) assert.equal(d.match(e),null);
  for (const value of ['{bad', JSON.stringify({text:42}), JSON.stringify(null)]) assert.equal(project(call({arguments:value})),null);
  for (const value of [result({turn:3}),result({step:2}),result({message:{toolCallId:'another'}})]) {
    assert.notEqual(d.match(call()).id,d.match(value).id);
    assert.equal(project(call(),value),null, 'wrong lifecycle cannot settle the reply');
  }
  assert.equal(d.update({state:undefined},{event:result()}),undefined);
});

test('RV04 replay stays stable; both reply and receipt renderer registrations are disposed', () => {
  assert.deepEqual(project(),project());
  const registered=[], removed=[];
  const ctx={effect(){},slots:{inject(_name,fn){registered.push(fn());},register({key}){return ()=>removed.push(key);}},
    uiConversation:{events:{register(def){registered.push(def);return ()=>removed.push(def.kind);}}}};
  client.apply(ctx);
  assert.ok(registered.includes(client.replyDefinition));
  assert.ok(registered.includes(client.definition));
  for(const dispose of registered.filter(v=>typeof v==='function'))dispose();
  assert.ok(removed.includes(client.replyDefinition.kind));
  assert.ok(removed.includes(client.definition.kind));
});
