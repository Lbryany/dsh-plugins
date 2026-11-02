import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {setup,ids} from '../test/helpers.mjs';
const reports=[];
async function scenario(id,covers,run){const clean=[];try{const f=await setup({after:fn=>clean.push(fn)});await run(f);reports.push({id,covers,status:'passed'});}finally{for(const fn of clean)await fn();}}
await scenario('SB01',['F-peer-B-01','F-peer-B-02'],async f=>{
 const r=await f.a.request({from:ids.a,requests:[{to:'bbbb',text:'B value'},{to:'cccc',text:'C value'}]});assert.equal(r.wait,true);
 for(const [i,from,text]of [[0,ids.b,'17'],[1,ids.c,'29']]){
  const reply=await f.a.reply({from,requestId:r.requests[i].requestId,kind:'result',text});assert.equal(reply.ok,true);
  assert.equal((await f.a.request({from:ids.a,requests:[{to:i?'cccc':'bbbb',text:'premature query'}]})).error,'request-pending');
  f.a.consume(ids.a,f.got.at(-1).m.source);
 }
 assert.equal(f.a.waitFor({from:ids.a}).wait,false);assert.equal(f.got.length,4);
});
await scenario('SB02',['F-peer-B-01'],async f=>{
 const r=await f.a.request({from:ids.a,requests:[{to:'bbbb',text:'Calculate 10 items'}]}),id=r.requests[0].requestId;
 f.b.consume(ids.b,f.got.at(-1).m.source);
 const q=await f.b.reply({from:ids.b,requestId:id,kind:'question',text:'unit price?'});f.a.consume(ids.a,f.got.at(-1).m.source);
 assert.equal((await f.a.reply({from:ids.a,requestId:id,kind:'answer',questionId:q.questionId,text:'3'})).ok,true);f.b.consume(ids.b,f.got.at(-1).m.source);
 assert.equal((await f.b.reply({from:ids.b,requestId:id,kind:'result',text:'30'})).ok,true);f.a.consume(ids.a,f.got.at(-1).m.source);
 assert.equal(f.a.waitFor({from:ids.a}).wait,false);
});
await scenario('SB03',['F-peer-B-03','F-peer-B-04'],async f=>{
 const partial=await f.a.request({from:ids.a,requests:[{to:'bbbb',text:'valid'},{to:'absent',text:'invalid'}]});assert.equal(partial.ok,false);assert.equal(partial.wait,false);assert.equal(f.got.length,1);
 assert.equal(f.got[0].m.source.display.version,2);
 assert.equal((await f.send('legacy')).ok,true);assert.equal(f.got.at(-1).m.source.display.version,1);
 f.time(600001);assert.equal(f.a.waitFor({from:ids.a,requestIds:[partial.requests[0].requestId]}).ok,false);
});
writeFileSync(new URL('../test/evidence/request-scenarios.json',import.meta.url),JSON.stringify(reports,null,2));console.log(JSON.stringify(reports,null,2));
