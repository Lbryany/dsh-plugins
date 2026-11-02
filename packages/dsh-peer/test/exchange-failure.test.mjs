import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createExchange,REQUEST_CAPABILITY} from '../lib/exchange.js';
function fixture(){
 const people=Object.fromEntries(['a','b'].map(session=>[session,{session,name:session,instanceId:session,capabilities:[REQUEST_CAPABILITY]}]));
 const nodes={},received=[],mode={};let calls=0;
 for(const self of ['a','b'])nodes[self]=createExchange({identity:id=>id===self?people[id]:null,resolve:id=>({target:people[id]}),
  transmit:async(other,req)=>{calls++;const res=nodes[other.session].receive(req);return Object.hasOwn(mode,req.kind)?mode[req.kind]:res;},
  admit:(req,exchange)=>{if(mode.admit)return {ok:false,error:'delivery-failed'};received.push({req,exchange});return {ok:true};}});
 return {nodes,mode,received,calls:()=>calls,request:()=>nodes.a.request({from:'a',requests:[{to:'b',text:'work'}]})};
}
test('B08 uncertain acknowledgement retains slot and reply phase',async()=>{
 const f=fixture();f.mode.request={ok:false,error:'timeout'};
 const first=await f.request();assert.equal(first.wait,false);assert.equal((await f.request()).error,'request-pending');assert.equal(f.calls(),1);
 delete f.mode.request;f.mode.question={ok:false,error:'unreachable',uncertain:true};
 const id=first.requests[0].requestId,q=await f.nodes.b.reply({from:'b',requestId:id,kind:'question',text:'value?'});assert.equal(q.wait,false);
 assert.equal((await f.nodes.a.reply({from:'a',requestId:id,kind:'answer',questionId:q.questionId,text:'3'})).ok,true);
 assert.equal((await f.nodes.b.reply({from:'b',requestId:id,kind:'result',text:'30'})).ok,true);
});
test('B09 failed admission fully restores pending state',async()=>{
 const f=fixture(),r=await f.request();f.mode.admit=true;
 const id=r.requests[0].requestId;assert.equal((await f.nodes.b.reply({from:'b',requestId:id,kind:'question',text:'value?'})).ok,false);
 const w=f.nodes.a.waitFor({from:'a'});assert.equal(w.wait,true);assert.equal(w.requests[0].questionId,undefined);
 delete f.mode.admit;assert.equal((await f.nodes.b.reply({from:'b',requestId:id,kind:'result',text:'done'})).ok,true);
});
test('B09 empty waits, queued result, restart and unsupported capability',async()=>{
 const f=fixture(),r=await f.request(),id=r.requests[0].requestId;
 assert.equal(f.nodes.a.waitFor({from:'a',requestIds:[]}).wait,false);
 await f.nodes.b.reply({from:'b',requestId:id,kind:'result',text:'done'});
 assert.equal(f.nodes.a.waitFor({from:'a'}).wait,true);
 assert.equal((await f.request()).error,'request-pending');
 f.nodes.b.clear();assert.equal((await f.nodes.b.reply({from:'b',requestId:id,kind:'result',text:'done'})).error,'unknown-request');
 const disabled=createExchange({enabled:false});assert.equal((await disabled.request({})).error,'unsupported');
});
test('B09 capacity never evicts active work; expiry and mixed-version peers are explicit',async()=>{
 let clock=0;
 const self={session:'a',name:'a',instanceId:'instance-a',capabilities:[REQUEST_CAPABILITY]};
 const ex=createExchange({now:()=>clock,identity:id=>id==='a'?self:null,
  resolve:id=>({target:{session:id,name:id,instanceId:'instance-'+id,capabilities:id==='old'?[]:[REQUEST_CAPABILITY]}}),transmit:async()=>({ok:true}),admit:()=>({ok:true})});
 assert.equal((await ex.request({from:'a',requests:[{to:'old',text:'task'}]})).error,'unsupported');
 let first;
 for(let i=0;i<512;i++){const r=await ex.request({from:'a',requests:[{to:'peer-'+i,text:'task'}]});assert.equal(r.ok,true);first||=r.requests[0].requestId;}
 assert.equal((await ex.request({from:'a',requests:[{to:'extra',text:'task'}]})).error,'request-capacity');
 assert.equal(ex.waitFor({from:'a',requestIds:[first]}).wait,true);
 clock=600001;assert.equal(ex.waitFor({from:'a',requestIds:[first]}).ok,false);
 assert.equal((await ex.request({from:'a',requests:[{to:'extra',text:'task'}]})).ok,true);
});
test('B08 malformed acknowledgements retain uncertainty without throwing',async()=>{
 const f=fixture();f.mode.request=null;
 const r=await f.request();assert.equal(r.ok,false);assert.equal(r.wait,false);assert.equal(r.requests[0].uncertain,true);
 assert.equal((await f.request()).error,'request-pending');
});
test('B11 queued work can yield, consumed local work cannot',async()=>{
 const f=fixture(),r=await f.request(),id=r.requests[0].requestId;
 const consume=(node,session,peer,kind)=>node.consume(session,{kind:'dsh-peer',display:{version:2},peer:{session:peer},exchange:{requestId:id,kind}});
 assert.equal(f.nodes.b.waitFor({from:'b'}).wait,true);
 consume(f.nodes.b,'b','a','request');assert.equal(f.nodes.b.waitFor({from:'b'}).wait,false);
 await f.nodes.b.reply({from:'b',requestId:id,kind:'question',text:'price?'});
 assert.equal(f.nodes.a.waitFor({from:'a'}).wait,true);
 consume(f.nodes.a,'a','b','question');assert.equal(f.nodes.a.waitFor({from:'a'}).wait,false);
});
test('B11 mixed queued result and local work cannot tell caller to yield',async()=>{
 const f=fixture(),r=await f.request();
 const other=await f.nodes.b.request({from:'b',requests:[{to:'a',text:'local work'}]});
 f.nodes.a.consume('a',{kind:'dsh-peer',display:{version:2},peer:{session:'b'},exchange:{requestId:other.requests[0].requestId,kind:'request'}});
 await f.nodes.b.reply({from:'b',requestId:r.requests[0].requestId,kind:'result',text:'done'});
 const wait=f.nodes.a.waitFor({from:'a'});assert.equal(wait.wait,false);assert.doesNotMatch(wait.text,/让出本轮/);assert.match(wait.text,/本地待办/);
});
