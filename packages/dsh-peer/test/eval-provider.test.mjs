import {test} from 'node:test';import assert from 'node:assert/strict';
import {requestBody,normalizeResponse} from '../eval/provider.mjs';
test('E Messages adapter pairs multiple tool results and includes cache tokens in budget',()=>{
 const data={stop_reason:'tool_use',content:[{type:'tool_use',id:'1',name:'peer_send',input:{to:'b',text:'task'}},{type:'tool_use',id:'2',name:'peer_send',input:{to:'c',text:'task'}}],usage:{input_tokens:20,cache_read_input_tokens:100,cache_creation_input_tokens:30,output_tokens:50}};
 const normalized=normalizeResponse(data);assert.equal(normalized.usage.prompt_tokens,150);
 const body=requestBody({model:'deepseek-flash',tools:[],maxTokens:1000,messages:[{role:'system',content:'task'},normalized.choices[0].message,{role:'tool',tool_call_id:'1',content:'ok'},{role:'tool',tool_call_id:'2',content:'ok'}]});
 assert.equal(body.messages.length,2);assert.deepEqual(body.messages[0].content,data.content);assert.equal(body.messages[1].content.length,2);assert.equal(body.thinking.type,'disabled');
 assert.throws(()=>normalizeResponse({...data,usage:{input_tokens:-1,output_tokens:1}}));
});
test('E preserves provider termination and refuses to call truncation natural',()=>{
 const r=normalizeResponse({content:[{type:'text',text:'partial'}],usage:{input_tokens:30,output_tokens:1000},stop_reason:'max_tokens'});
 assert.equal(r.stopReason,'max_tokens');
});
