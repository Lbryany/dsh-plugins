import {test} from 'node:test';
import assert from 'node:assert/strict';
import {requestTools} from '../lib/request-tools.js';
import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools';
test('B10 registered tools conclude only successful explicit handoffs',async()=>{
 for(const response of [{ok:true,wait:true,text:'accepted'},{ok:true,wait:false,text:'local work'},{ok:false,wait:false,text:'partial'},{ok:false,wait:true,text:'uncertain'}]){
  let concluded=0;const core={request:async()=>response,reply:async()=>response,waitFor:()=>response};
  for(const tool of requestTools(core,a=>a.id)){
   const result=await tool.execute(tool.name==='peer_request'?{requests:[{to:'b',text:'task'}]}:tool.name==='peer_reply'?{requestId:'x',kind:'result',text:'done'}:{},{agent:{id:'a'},concludeTurn:()=>concluded++});validateJsonSchemaValue(tool.output.schema,result);
   assert.equal(result.handoff.wait,response.ok&&response.wait);assert.deepEqual(tool.output.presentationMeta({},result),{peerExchange:result.handoff});
  }
  assert.equal(concluded,response.ok&&response.wait?3:0);
 }
});
