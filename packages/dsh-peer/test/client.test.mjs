import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { JSDOM } from 'jsdom';
import { createPeerClient } from '../src/client.js';
import { relayText } from '../lib/message.js';
const client=createPeerClient(React);
function event(text, extra={}) {
 const peer={name:'reviewer',session:'session-aaaa',cwd:'/workspace/中文😀',profile:'review'};
 const raw=relayText(peer,text); const start=raw.indexOf('\n')+1;
 return {type:'user/message',surfaceOp:'append',seq:4,time:1700000000000,data:{id:'m1',content:[{type:'text',text:raw}],source:{kind:'dsh-peer',form:'relay',peer,display:{version:1,id:'wire',to:'session-bbbb',start,end:start+text.length}}},...extra};
}
test('UI01 exclusive source selection: append and steering, never text impersonation',()=>{
 const e=event('first\nsecond');assert.equal(client.definition.match(e).exclusive,true);
 assert.equal(client.definition.match({...e,surfaceOp:'replace'}),null);
 for(const kind of ['user','other-plugin']) assert.equal(client.definition.match({...e,data:{...e.data,source:{kind}}}),null);
 const d=client.definition.start({}, {event:e});
 assert.equal(client.definition.buildViewNode({state:d,key:'k',id:'m1',matches:[{location:{kind:'unresolved'}}]}).data,d);
});
test('UI04/UI05 first line only in title, Unicode ranges, raw fallback and fence context',()=>{
 const d=client.messageData(event('检查😀\r\n第二行\n第三行'));
 assert.equal(d.first,'检查😀');assert.equal(d.body,'第二行\n第三行');
 const html=renderToStaticMarkup(React.createElement(client.PeerMessageCard,{node:{data:d}}));
 assert.match(html,/来自 @reviewer/);assert.doesNotMatch(html.split('原始记录')[0],/检查😀.*检查😀/s);
 assert.equal(client.messageData(event('one')).body,'');
 assert.equal(client.messageData(event('\nrest')).first,'');
 assert.equal(client.messageData(event('```js\nconst a=1;\n```')).markdown,'```js\nconst a=1;\n```');
 const old=event('old');delete old.data.source.display;
 const legacy=client.messageData(old);assert.equal(legacy.body,old.data.content[0].text);assert.equal(legacy.first,'');
 const bad=event('first\nsecond');bad.data.source.display.start+=1;
 assert.equal(client.messageData(bad).body,bad.data.content[0].text);
});
test('UI02 structured status, no success guess from legacy text',()=>{
 for(const [outcome,label] of [['queued','已接纳'],['steered','已接纳插话'],['duplicate','已接纳过'],['rejected','未发送'],['unknown','状态未知']]){
  const html=renderToStaticMarkup(React.createElement(client.PeerSendResult,{phase:'result',block:{meta:{peer:{version:1,target:{name:'reviewer'},outcome,text:'summary\nbody'}},content:[]}}));
  assert.ok(html.includes(label));
 }
 const html=renderToStaticMarkup(React.createElement(client.PeerSendResult,{phase:'result',block:{content:[{type:'text',text:'已发给 reviewer'}]}}));
 assert.ok(html.includes('查看结果'));assert.ok(!html.includes('已接纳'));
});
test('UI03 receiving host command access and truthful failures',async()=>{
 const calls=[]; const controls=client.commandControls({get:()=>({commands:{execute:async(...args)=>{calls.push(args);return {ok:true,value:{result:{kind:'success',text:'{"paused":true}'}}};}}})},'b',async url=>{calls.push(url);return {ok:true,json:async()=>({paused:true,count:12})};},()=> 'http://localhost/');
 await assert.rejects(()=>controls.status('a','elsewhere'));
 assert.equal((await controls.status('a','b')).paused,true);
 assert.equal(calls[0],'http://localhost/api/dsh-peer/status?session=b&from=a');
 const denied=client.commandControls({get:()=>({commands:{execute:async()=>({ok:false})}})},'b');
 await assert.rejects(()=>denied.resume('a','b'));
});
test('UI03 disclosure is local; resume double click invokes once and failure never fakes success',async()=>{
 const dom=new JSDOM('<div id="root"></div>',{url:'http://localhost/'});
 const oldWindow=globalThis.window,oldDocument=globalThis.document;
 globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
 const root=createRoot(document.getElementById('root'));let queries=0,resumes=0,finish;
 const controls={status:async()=>{queries++;return {available:true,paused:true};},resume:()=>{resumes++;return new Promise(r=>finish=r);}};
 try {
  await act(async()=>root.render(React.createElement(client.PeerMessageCard,{node:{data:client.messageData(event('first\nsecond'))},controls})));
  const card=document.querySelector('[data-peer-message]');assert.equal(card.open,false);assert.equal(queries,0);
  await act(async()=>{card.open=true;card.dispatchEvent(new dom.window.Event('toggle'));});assert.equal(queries,0);
  const details=document.querySelector('.dsh-peer-meta');
  await act(async()=>{details.open=true;details.dispatchEvent(new dom.window.Event('toggle'));});
  const button=[...document.querySelectorAll('button')].find(x=>x.textContent==='恢复接收');assert.equal(button.disabled,false);
  await act(async()=>{button.click();button.click();});assert.equal(resumes,1);
  await act(async()=>finish({ok:false,text:'恢复被拒绝'}));assert.ok(document.body.textContent.includes('恢复被拒绝'));
  assert.ok(document.body.textContent.includes('此方向已暂停'));
 } finally {await act(async()=>root.unmount());dom.window.close();globalThis.window=oldWindow;globalThis.document=oldDocument;delete globalThis.IS_REACT_ACT_ENVIRONMENT;}
});
test('UI05 host Markdown contract includes code and footnote labels',()=>{
 const actualContract=({text,labels})=>{assert.ok(labels.code.copyLabel);assert.ok(labels.code.toolbarLabels.wrapLabel);assert.ok(labels.footnotes);return React.createElement('pre',null,text);};
 const c=createPeerClient(React,{MarkdownText:actualContract});
 renderToStaticMarkup(React.createElement(c.PeerMessageCard,{node:{data:c.messageData(event('first\n```js\nconst a=1;\n```\nfootnote[^1]\n\n[^1]: details'))}}));
});
test('UI03 client declares the command service required by card actions',()=>{
 assert.ok(client.inject.includes('remote.commands'));
});
test('UI06 malformed structured metadata falls back to full text without crashing',()=>{
 const e=event('first\nsecond');e.data.source.display.version=2;
 e.data.source.exchange={requestId:'id',kind:'result',pending:'malformed'};
 const d=client.messageData(e);assert.equal(d.legacy,true);assert.equal(d.body,e.data.content[0].text);
});
