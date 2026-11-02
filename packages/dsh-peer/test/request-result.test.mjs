import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids} from './helpers.mjs';
const request=(f,requests=[{to:'bbbb',text:'检查输入'}],extra={})=>f.a.request({from:ids.a,requests,...extra});
const reply=(f,id,kind,text,extra={})=>f.b.reply({from:ids.b,requestId:id,kind,text,...extra});
const consumed=(core,self,got)=>core.consume(self,got.m.source);
for(const socket of [false,true])test(`B01/B02 batch, partial result and consumption (${socket?'socket':'local'})`,async t=>{
 const f=await setup(t,{socket});assert.equal(typeof f.a.request,'function','0.1.1 has no tracked handoff');
 const r=await request(f,[{to:'bbbb',text:'B值'},{to:'cccc',text:'C值'}]);assert.equal(r.ok,true);assert.equal(r.wait,true);assert.equal(r.requests.length,2);assert.equal(f.got.length,2);
 const [b,c]=r.requests.map(x=>x.requestId);assert.notEqual(b,c);
 const rb=await reply(f,b,'result','17');assert.equal(rb.ok,true);assert.equal(rb.wait,true);
 // Result is delivered, but its owning model has not consumed it yet.
 assert.equal((await request(f)).error,'request-pending');
 consumed(f.a,ids.a,f.got.at(-1));
 assert.equal(f.a.waitFor({from:ids.a}).wait,true); // C still pending.
 assert.equal((await f.a.reply({from:ids.c,requestId:c,kind:'result',text:'29'})).ok,true);
 consumed(f.a,ids.a,f.got.at(-1));
 assert.equal(f.a.waitFor({from:ids.a}).wait,false);
 assert.equal((await request(f)).ok,true); // a new round, after consumption
});
test('B03 clarification is scoped to one request and a matching question',async t=>{
 const f=await setup(t);const r=await request(f),id=r.requests[0].requestId;
 const q=await reply(f,id,'question','单价？');assert.equal(q.ok,true);assert.ok(q.questionId);
 assert.equal((await reply(f,id,'question','再问')).ok,false);
 assert.equal((await f.a.reply({from:ids.a,requestId:id,kind:'answer',questionId:'wrong',text:'3'})).ok,false);
 assert.equal((await f.a.reply({from:ids.a,requestId:id,kind:'answer',questionId:q.questionId,text:'3'})).ok,true);
 assert.equal((await reply(f,id,'result','30')).ok,true);
 assert.equal(f.got.length,4);
});
test('B04 results are exactly once and bound to participants',async t=>{
 const f=await setup(t);const r=await request(f),id=r.requests[0].requestId;
 assert.equal((await f.a.reply({from:ids.c,requestId:id,kind:'result',text:'forged'})).ok,false);
 assert.equal((await reply(f,id,'result','通过')).ok,true);
 const n=f.got.length;assert.equal((await reply(f,id,'result','通过')).duplicate,true);assert.equal(f.got.length,n);
 assert.equal((await reply(f,id,'result','changed')).ok,false);
 consumed(f.a,ids.a,f.got.at(-1));
 const second=await request(f);assert.equal(second.ok,true);
 assert.equal((await reply(f,second.requests[0].requestId,'result','通过')).ok,true,'same words for another request are not a duplicate');
});
test('B05 failed/partial admission cannot conclude; reservations roll back',async t=>{
 const f=await setup(t);f.hooks.set(ids.b,()=>{throw Error('receiver failed');});
 const bad=await request(f);assert.equal(bad.ok,false);assert.equal(bad.wait,false);assert.equal(f.got.length,0);
 f.hooks.delete(ids.b);assert.equal((await request(f)).ok,true);
 const partial=await f.a.request({from:ids.c,requests:[{to:'aaaa',text:'task'},{to:'missing',text:'task'}]});
 assert.equal(partial.ok,false);assert.equal(partial.wait,false);assert.equal(partial.requests.filter(x=>x.ok).length,1);
});
test('B06 pending/expired requests and false waits do not fabricate completion',async t=>{
 const f=await setup(t);const r=await request(f),id=r.requests[0].requestId;
 const n=f.got.length;assert.equal((await request(f)).ok,false);assert.equal(f.got.length,n);
 assert.equal(f.a.waitFor({from:ids.c,requestIds:[id]}).ok,false);
 f.time(600001);assert.equal((await reply(f,id,'result','late')).ok,false);
 const wait=f.a.waitFor({from:ids.a,requestIds:[id]});assert.equal(wait.ok,false);assert.equal(wait.wait,false);
});
test('B07 request messages retain source and explicit state; legacy still delivers',async t=>{
 const f=await setup(t);const r=await request(f),m=f.got[0].m;
 assert.equal(m.source.display.version,2);assert.equal(m.source.exchange.requestId,r.requests[0].requestId);
 assert.ok(m.content[0].text.includes(r.requests[0].requestId));
 assert.equal((await f.send('legacy message')).ok,true);assert.equal(f.got.at(-1).m.source.display.version,1);
});
test('B03 fourth clarification is rejected while final result remains deliverable',async t=>{
 const f=await setup(t),r=await request(f),id=r.requests[0].requestId;
 for(let i=0;i<3;i++){
  const q=await reply(f,id,'question','parameter '+i);assert.equal(q.ok,true);
  assert.equal((await f.a.reply({from:ids.a,requestId:id,kind:'answer',questionId:q.questionId,text:'value '+i})).ok,true);
 }
 assert.equal((await reply(f,id,'question','fourth')).error,'invalid-reply-state');
 assert.equal((await reply(f,id,'result','done')).ok,true);
});
test('B09 stale Host incarnation cannot deliver structured input',async t=>{
 const f=await setup(t,{socket:true}),sender=f.a.list(ids.a).find(x=>x.self);
 const bad=f.receive({v:1,type:'exchange',id:'wire',requestId:'request',kind:'request',text:'stale',token:f.b.token,
  from:{...sender,session:ids.a},to:{session:ids.b,instanceId:'stale-instance'}});
 assert.equal(bad.error,'stale-peer');assert.equal(f.got.length,0);
});
