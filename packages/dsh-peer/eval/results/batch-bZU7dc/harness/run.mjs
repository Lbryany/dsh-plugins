// Core-level model simulation, not a full DSH agent runtime benchmark.
// Explicit credentials only (including an authorized isolated profile copy); never reads real profiles itself.
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateJsonSchemaValue} from '@deepseek-ai/dsh-tools';
import {toolDescription,fingerprint,reserveSend,grade} from './contract.mjs';
import {complete,countInput} from './provider.mjs';
const spec=JSON.parse(readFileSync(new URL('./loop-control-cases.json',import.meta.url)));
if(spec.model!=='deepseek-flash')throw Error('Only deepseek-flash is allowed');
if(process.argv.includes('--dry')){console.log(JSON.stringify({mode:'core simulation',protocol:'messages',thinking:'disabled',temperature:0,model:spec.model,runs:spec.cases.length*spec.runsPerCasePerVersion*2,limits:spec.limits,thresholds:spec.thresholds,credentialConfigured:!!process.env.DSH_PEER_EVAL_API_KEY,baseline:process.env.PEER_BASELINE||null},null,2));process.exit(0);}
if(!process.env.DSH_PEER_EVAL_API_KEY||!process.env.PEER_BASELINE){console.error('BLOCKED: set DSH_PEER_EVAL_API_KEY and PEER_BASELINE; real user credentials are never read.');process.exit(2);}
const variants={baseline:resolve(process.env.PEER_BASELINE),changed:resolve(new URL('..',import.meta.url).pathname)};
const identities=Object.fromEntries(Object.entries(variants).map(([name,path])=>[name,fingerprint(path)]));
if(identities.baseline.version!=='0.1.1'||identities.changed.version!=='0.1.2')throw Error('Unexpected baseline/changed version');
const outputRoot=new URL('./results/',import.meta.url);mkdirSync(outputRoot,{recursive:true});
const out=mkdtempSync(join(outputRoot.pathname,'batch-'));
writeFileSync(join(out,'manifest.json'),JSON.stringify({mode:'core simulation; FIFO agent delivery, actual registered tool schemas/execution/envelope; real Host handoff semantics verified separately, same scenario system prompts; no full Host model scheduler',createdAt:new Date().toISOString(),protocol:'messages',thinking:'disabled',temperature:0,budgetMethod:'provider input token count + 32-token reserve, actual usage includes cached input',perRequestMaxOutput:1000,credentialSource:process.env.DSH_PEER_EVAL_CREDENTIAL_SOURCE||'explicit environment',spec,identities,harness:Object.fromEntries(['run.mjs','provider.mjs','contract.mjs','from-profile.mjs'].map(file=>[file,createHash('sha256').update(readFileSync(new URL(file,import.meta.url))).digest('hex')]))},null,2),{flag:'wx'});
const reports=[];let stop=false;
const signalController=new AbortController();const interrupt=()=>signalController.abort(new Error('Evaluation interrupted'));
process.once('SIGTERM',interrupt);process.once('SIGINT',interrupt);
for(const c of spec.cases){if(stop)break;
 for(let run=0;run<spec.runsPerCasePerVersion;run++){if(stop)break;
  for(const variant of (run%2?['changed','baseline']:['baseline','changed'])){
   const module=await import(pathToFileURL(join(variants[variant],'lib/core.js')));
   const {apply}=await import(pathToFileURL(join(variants[variant],'index.js')));
   const definitions=new Map(),listeners=new Map();let tools;
   const temp=mkdtempSync(join(tmpdir(),'peer-eval-')),messages={},queue=[],transcript=[],usage={input:0,output:0,total:0};
   const budget={attempts:0};let reason='natural',turns=0,error;
   const start=Date.now(),deadline=start+spec.limits.seconds*1000;
   const agents=new Map();
   const deliver=(target,m)=>{
    queue.push({id:target,text:m.content.filter(x=>x.type==='text').map(x=>x.text).join('\n'),message:m});
    const d=m.source.display;
    transcript.push({agent:m.source.peer.session.slice(8,9),args:{to:target.slice(8,9),text:d?m.content[0].text.slice(d.start,d.end):m.content[0].text},result:{ok:true,delivered:'queued'},edge:true,exchange:m.source.exchange});
   };
   const ctx={agents:{list:()=>[...agents.values()],get:id=>agents.get(id)},tools:{register:t=>definitions.set(t.name,t)},
    on:(name,fn)=>{const group=listeners.get(name)||[];group.push(fn);listeners.set(name,group);},inject(){},effect(){}};
   try{
    for(const id of ['a','b','c'])if(c[id]){
     const sid='session-'+id.repeat(4);
     agents.set(sid,{id:sid,session:{header:{id:sid,cwd:temp},deriveMessages:()=>[{role:'user'}]},followup:m=>deliver(sid,m),steer:m=>deliver(sid,m)});
     messages[id]=[{role:'system',content:c[id]}];
    }
    apply(ctx,{dir:join(temp,'run'),namesFile:join(temp,'names.json')});
    for(const [sid,agent]of agents)await definitions.get('peer_rename').execute({name:sid.slice(8,9)},{agent});
    tools=[...definitions.values()].map(({name,description,parameters})=>({type:'function',function:{name,description,parameters}}));
    queue.push({id:'session-aaaa',text:c.initial?module.relayText({name:'b',session:'session-bbbb'},c.initial):'开始完成用户任务。'});
    conversation:while(queue.length){
     const item=queue.shift(),id=item.id.slice(8,9);
     if(item.message)for(const fn of listeners.get('session/event')||[])fn(agents.get(item.id).session,{type:'user/message',data:item.message});
     messages[id].push({role:'user',content:item.text});
     transcript.push({agent:id,input:item.text});
     let again=true;
     while(again){
      if(Date.now()>=deadline){reason='time-cap';break conversation;}
      if(signalController.signal.aborted)throw signalController.signal.reason;
      const signal=AbortSignal.any([signalController.signal,AbortSignal.timeout(Math.max(1,deadline-Date.now()))]);
      const connection={key:process.env.DSH_PEER_EVAL_API_KEY,url:process.env.DSH_PEER_EVAL_URL||'https://api.deepseek.com/anthropic/v1/messages',model:spec.model,messages:messages[id],tools,signal};
      const inputCount=await countInput(connection);
      const remaining=spec.limits.tokens-usage.total-inputCount-32;
      if(remaining<100){reason='token-cap';break conversation;}
      if(budget.attempts>=spec.limits.sendAttempts){reason='send-cap';break conversation;}
      const maxTokens=Math.min(1000,remaining);
      transcript.push({agent:id,request:{inputCount,maxTokens}});
      const data=await complete({...connection,maxTokens});
      if(!data.usage||!Number.isFinite(data.usage.prompt_tokens)||!Number.isFinite(data.usage.completion_tokens)||!data.choices?.[0]?.message)throw Error('Missing provider usage/message');
      usage.input+=data.usage.prompt_tokens;usage.output+=data.usage.completion_tokens;usage.total=usage.input+usage.output;turns++;
      const m=data.choices[0].message;messages[id].push(m);transcript.push({agent:id,message:m,usage:data.usage,stopReason:data.stopReason});again=!!m.tool_calls?.length;
      if(usage.total>spec.limits.tokens){reason='token-cap';break conversation;}
      if(data.stopReason==='max_tokens'){reason='output-cap';break conversation;}
      if(!['end_turn','tool_use'].includes(data.stopReason))throw Error('Unexpected provider stop reason: '+data.stopReason);
      if((data.stopReason==='tool_use')!==again)throw Error('Provider stop reason/tool mismatch');
      let concluded=false;
      for(const call of m.tool_calls||[]){
       if(Date.now()>=deadline){reason='time-cap';break conversation;}
       let result,args;
       try{
        args=JSON.parse(call.function.arguments);
        const attempts=call.function.name==='peer_request'?(Array.isArray(args.requests)?args.requests.length:1):['peer_send','peer_reply'].includes(call.function.name)?1:0;
        for(let i=0;i<attempts;i++)if(!reserveSend(budget,spec.limits.sendAttempts)){reason='send-cap';break conversation;}
        const definition=definitions.get(call.function.name);
        if(definition)validateJsonSchemaValue(definition.parameters,args);
        result=definition?await definition.execute(args,{agent:agents.get(item.id),concludeTurn:()=>{concluded=true;}}):{ok:false,text:'Invalid peer/tool'};
       }catch(e){result={ok:false,text:'Invalid arguments: '+e.message};}
       transcript.push({agent:id,call,parameters:args,result});messages[id].push({role:'tool',tool_call_id:call.id,content:result.text});
      }
      if(concluded){transcript.push({agent:id,concluded:true});again=false;}
     }
    }
   }catch(e){reason=signalController.signal.aborted?'interrupted':Date.now()>=deadline?'time-cap':'provider-error';error=String(e.message);stop=true;}
   finally{
    const report={case:c.id,run,variant,model:spec.model,usage,usageComplete:!error,attempts:budget.attempts,turns,reason,error,...grade(c,transcript,reason,budget.attempts),transcript};
    reports.push(report);writeFileSync(join(out,`${c.id}-${run}-${variant}.json`),JSON.stringify(report,null,2),{flag:'wx'});
    rmSync(temp,{recursive:true,force:true});
   }
   console.log(c.id,run,variant,reason,reports.at(-1).pass,usage.total);
   if(stop)break;
  }
 }
}
writeFileSync(join(out,'summary.json'),JSON.stringify(reports.map(({transcript,...r})=>r),null,2),{flag:'wx'});
const changed=reports.filter(r=>r.variant==='changed'),quiet=changed.filter(r=>['E01','E02','E03'].includes(r.case));
if(reports.length!==spec.cases.length*spec.runsPerCasePerVersion*2||quiet.filter(r=>r.pass).length<14||changed.filter(r=>!['E01','E02','E03'].includes(r.case)).some(r=>!r.pass)||changed.some(r=>r.reason!=='natural'))process.exitCode=1;
process.removeListener('SIGTERM',interrupt);process.removeListener('SIGINT',interrupt);
console.log('Evidence:',out);
