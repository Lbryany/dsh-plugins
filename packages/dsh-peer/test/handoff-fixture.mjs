import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import { defineTool } from '@deepseek-ai/dsh-tools';
export const inject=['agents','tools','llm'];
export function apply(ctx,config){
 const counts={}, events=[], plans={}, snapshots=[]; let marker=0;
 class Scripted extends LlmAdapter {
  async *stream(opts){
   const n=(counts[opts.model]||0)+1;counts[opts.model]=n;snapshots.push({model:opts.model,n,messages:opts.messages});
   if(opts.model==='parallel-a'&&n===2){
    for(let i=0;i<200&&!ctx.agents.get('session-gggg-parallel').inbox.nextTurn.length;i++)await new Promise(r=>setTimeout(r,10));
    assert.ok(ctx.agents.get('session-gggg-parallel').inbox.nextTurn.length,'other result must be queued before wait');
   }
   const plan=plans[opts.model];const calls=typeof plan==='function'?plan(opts,n):n===1?plan||[]:[];
   let index=0;
   for(const [name,args] of calls){const block={type:'tool-call',id:opts.model+'-'+index,name,arguments:JSON.stringify(args)};yield {type:'block-start',index,blockType:'tool-call'};yield {type:'tool-call-delta',index,id:block.id,name,argumentsDelta:block.arguments};yield {type:'block-end',index,block};index++;}
   if(!calls.length){const block={type:'text',text:'complete'};yield {type:'block-start',index:0,blockType:'text'};yield {type:'text-delta',index:0,text:block.text};yield {type:'block-end',index:0,block};}
   yield {type:'finish',reason:{kind:calls.length?'tool-calls':'stop'}};
  }
 }
 ctx.llm.registerAdapter(['peer-script'],new Scripted());
 ctx.tools.register(defineTool({name:'peer_test_marker',description:'fixture',parameters:{},output:{schema:{type:'object',additionalProperties:false,properties:{ok:{type:'boolean',required:true}}},render:()=>[{type:'text',text:'marked'}]},isConcurrencySafe:()=>false,
  execute(_args,exec){marker++;exec.agent.steer(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'fresh-steering'}]}));exec.agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'fresh-followup'}]}));return {ok:true};}}));
 ctx.on('session/event',(session,e)=>{if(['tool/result','user/message','turn/end'].includes(e.type))events.push({session:session.header.id,event:e});});
 ctx.effect(()=>{void(async()=>{try{
  await new Promise(r=>setTimeout(r,300));
  const seed=()=>[{seq:0,time:Date.now(),type:'user/message',data:createUserMessage({source:{kind:'user'},content:[{type:'text',text:'seed'}]}),surfaceOp:'append'}];
  const target=(await ctx.agents.create({sessionId:'session-bbbb-handoff',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'peer-script',model:'target'}})).agent;
  // Park receiver work: actual requester loop and actual tool runtime still execute.
  target.followup=m=>target.send(m,'next-turn',false);
  const cases={flat:[['peer_request',{to:'bbbb',text:'flat task'}]],mixed:[['peer_request',{to:'bbbb',text:'single',requests:[{to:'bbbb',text:'batch'}]}]],terminal:[['peer_request',{requests:[{to:'bbbb',text:'task terminal'}]}]],keep:[['peer_request',{requests:[{to:'bbbb',text:'task keep'}],wait:false}]],failed:[['peer_request',{requests:[{to:'missing',text:'task failed'}]}]],legacy:[['peer_send',{to:'bbbb',text:'legacy'}]],race:[['peer_request',{requests:[{to:'bbbb',text:'task race'}]}],['peer_test_marker',{}]]};
  for(const [name,plan]of Object.entries(cases)){
   plans[name]=plan;
   const agent=(await ctx.agents.create({sessionId:'session-'+name+'-handoff',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'peer-script',model:name}})).agent;
   agent.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'start '+name}]}));await agent.whenIdle();
  }
  assert.equal(counts.flat,1);assert.equal(counts.mixed,2);assert.equal(counts.terminal,1,'terminal tool skips tail');assert.equal(counts.keep,2);assert.equal(counts.failed,2);assert.equal(counts.legacy,2);assert.equal(marker,1);assert.equal(counts.race,3,'steering and queued followup both run');
  const race=snapshots.filter(x=>x.model==='race');assert.ok(JSON.stringify(race[1]).includes('fresh-steering'));assert.ok(JSON.stringify(race[2]).includes('fresh-followup'));
  plans['duo-a']=(_opts,n)=>n<3?[['peer_request',{requests:[{to:'dddd',text:'round '+n}]}]]:[];
  plans['duo-b']=()=>{const e=events.filter(x=>x.session==='session-dddd-duo'&&x.event.type==='user/message'&&x.event.data.source?.exchange).at(-1);return [['peer_reply',{requestId:e.event.data.source.exchange.requestId,kind:'result',text:'done'}]];};
  const duoA=(await ctx.agents.create({sessionId:'session-eeee-duo',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'peer-script',model:'duo-a'}})).agent;
  const duoB=(await ctx.agents.create({sessionId:'session-dddd-duo',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'peer-script',model:'duo-b'}})).agent;
  duoA.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'two rounds'}]}));
  for(let i=0;i<10;i++){await duoA.whenIdle();await duoB.whenIdle();await new Promise(r=>setTimeout(r,20));if(counts['duo-a']===3&&counts['duo-b']===2)break;}
  assert.equal(counts['duo-a'],3);assert.equal(counts['duo-b'],2,'second request admitted after real consumption');
  plans['parallel-a']=(_opts,n)=>n===1?[['peer_request',{requests:[{to:'hhhh',text:'parallel B'},{to:'iiii',text:'parallel C'}]}]]:n===2?[['peer_wait',{}]]:[];
  for(const [model,sid,value]of [['parallel-b','session-hhhh-parallel','parallel-B'],['parallel-c','session-iiii-parallel','parallel-C']]){
   plans[model]=()=>{const e=events.filter(x=>x.session===sid&&x.event.type==='user/message'&&x.event.data.source?.exchange).at(-1);return [['peer_reply',{requestId:e.event.data.source.exchange.requestId,kind:'result',text:value}]];};
   await ctx.agents.create({sessionId:sid,meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'peer-script',model}});
  }
  const pa=(await ctx.agents.create({sessionId:'session-gggg-parallel',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'peer-script',model:'parallel-a'}})).agent;
  pa.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'parallel work'}]}));
  for(let i=0;i<10;i++){await pa.whenIdle();await ctx.agents.get('session-hhhh-parallel').whenIdle();await ctx.agents.get('session-iiii-parallel').whenIdle();await new Promise(r=>setTimeout(r,20));}
  assert.equal(counts['parallel-a'],3,'queued result wait skips tail and drains next turn');
  const finalInput=JSON.stringify(snapshots.filter(x=>x.model==='parallel-a').at(-1));assert.ok(finalInput.includes('parallel-B')&&finalInput.includes('parallel-C'));
  const results=events.filter(x=>x.event.type==='tool/result');assert.ok(results.length>=6);
  assert.ok(snapshots[0].messages.some(m=>m.role==='system'&&JSON.stringify(m).includes('dsh-peer 协作约定')),'native Host must assemble the registered peer policy');
  writeFileSync(config.ready,JSON.stringify({ok:true,counts,marker,events,snapshots},null,2));
 }catch(e){writeFileSync(config.ready,JSON.stringify({ok:false,error:e.stack,counts,marker,events,snapshots},null,2));}})();return()=>{};});
}
