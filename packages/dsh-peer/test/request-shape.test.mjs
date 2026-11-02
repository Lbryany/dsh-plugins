import {test} from 'node:test';
import assert from 'node:assert/strict';
import {setup,ids} from './helpers.mjs';
test('B13 explicit single-target request uses the same tracked lifecycle',async t=>{
 const f=await setup(t),r=await f.a.request({from:ids.a,to:'bbbb',text:'review'});
 assert.equal(r.ok,true);assert.equal(r.wait,true);assert.equal(r.requests.length,1);assert.equal(f.got.length,1);
 assert.equal((await f.a.request({from:ids.a,to:'bbbb',text:'new work'})).error,'request-pending');
 assert.equal((await f.b.reply({from:ids.b,requestId:r.requests[0].requestId,kind:'result',text:'done'})).ok,true);
});
test('B13 conflicting forms reject before any delivery',async t=>{
 const f=await setup(t);
 const r=await f.a.request({from:ids.a,to:'bbbb',text:'must not be silently dropped',requests:[{to:'cccc',text:'batch task'}]});
 assert.equal(r.ok,false);assert.equal(r.wait,false);assert.equal(f.got.length,0);
});
test('B13 missing or empty forms never conclude or deliver',async t=>{
 const f=await setup(t);
 for(const args of [{},{to:'bbbb'},{text:'task'},{requests:[]},{to:'bbbb',requests:[{to:'cccc',text:'work'}]}]){
  const r=await f.a.request({from:ids.a,...args});assert.equal(r.ok,false);assert.equal(r.wait,false);
 }
 assert.equal(f.got.length,0);
});
