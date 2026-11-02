// DeepSeek Messages wire contract used by the installed DSH provider.
// Evaluator transcript stays provider-neutral; native blocks preserve replay.
export function requestBody({model,messages,tools,maxTokens}) {
 const native=[];
 for(const m of messages.filter(m=>m.role!=='system')){
  const role=m.role==='assistant'?'assistant':'user';
  const content=m.role==='tool'?[{type:'tool_result',tool_use_id:m.tool_call_id,content:m.content}]:m.nativeContent||[
   ...(m.content?[{type:'text',text:m.content}]:[]),
   ...(m.tool_calls||[]).map(c=>({type:'tool_use',id:c.id,name:c.function.name,input:JSON.parse(c.function.arguments)}))];
  if(!content.length)continue;
  if(native.at(-1)?.role===role)native.at(-1).content.push(...content);else native.push({role,content});
 }
 return {model,system:messages.filter(m=>m.role==='system').map(m=>m.content).join('\n\n'),messages:native,
  tools:tools.map(t=>({name:t.function.name,description:t.function.description,input_schema:t.function.parameters})),
  max_tokens:maxTokens,temperature:0,thinking:{type:'disabled'},stream:false};
}
export function normalizeResponse(data){
 if(!Array.isArray(data.content)||!data.usage||typeof data.stop_reason!=='string')throw Error('Missing provider content/usage/stop reason');
 const u=data.usage;
 for(const key of ['input_tokens','output_tokens'])if(!Number.isSafeInteger(u[key])||u[key]<0)throw Error('Invalid provider usage');
 for(const key of ['cache_read_input_tokens','cache_creation_input_tokens'])if(u[key]!==undefined&&(!Number.isSafeInteger(u[key])||u[key]<0))throw Error('Invalid cache usage');
 const tool_calls=data.content.filter(b=>b.type==='tool_use').map(b=>({id:b.id,type:'function',function:{name:b.name,arguments:JSON.stringify(b.input)}}));
 return {stopReason:data.stop_reason,usage:{prompt_tokens:u.input_tokens+(u.cache_read_input_tokens||0)+(u.cache_creation_input_tokens||0),completion_tokens:u.output_tokens,native:u},choices:[{message:{role:'assistant',content:data.content.filter(b=>b.type==='text').map(b=>b.text).join('\n'),...(tool_calls.length?{tool_calls}:{}),nativeContent:data.content}}]};
}
export async function complete({key,url,model,messages,tools,maxTokens,signal}){
 const response=await fetch(url,{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},redirect:'error',body:JSON.stringify(requestBody({model,messages,tools,maxTokens})),signal});
 if(!response.ok)throw Error('Provider HTTP '+response.status);
 return normalizeResponse(await response.json());
}

export async function countInput({key,url,model,messages,tools,signal}){
 const {max_tokens,stream,temperature,...body}=requestBody({model,messages,tools,maxTokens:1});
 const response=await fetch(url+'/count_tokens',{method:'POST',headers:{'x-api-key':key,'anthropic-version':'2023-06-01','Content-Type':'application/json'},redirect:'error',body:JSON.stringify(body),signal});
 if(!response.ok)throw Error('Token counter HTTP '+response.status);
 const data=await response.json();if(!Number.isSafeInteger(data.input_tokens)||data.input_tokens<0)throw Error('Invalid input token count');return data.input_tokens;
}
