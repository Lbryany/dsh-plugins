import { writeFileSync } from 'node:fs';
import { createUserMessage, createToolResultMessage } from '@deepseek-ai/dsh-llm';
export const inject=['agents','tools','commands','sessionTitle','workspaceRegistry'];
export function apply(ctx,config){
 ctx.effect(()=>{
 const run=async()=>{
  await new Promise(r=>setTimeout(r,300));
  try{
   const workspace=await ctx.workspaceRegistry.create(config.cwd,'Peer 测试工作区');
   const seed=(id,text)=>{
    const events=[];const append=(type,data,surfaceOp)=>events.push({type,seq:events.length,time:Date.now(),data,...surfaceOp?{surfaceOp}:{}});
    if(config.history&&id==='seed-b')for(let turn=1;turn<=250;turn++){
     append('turn/start',{turn});append('step/start',{turn,step:1});
     const source=turn===1?{kind:'dsh-peer',form:'relay',peer:{name:'archived-reviewer',session:'archived-peer'}}:{kind:'user'};
     append('user/message',createUserMessage({id:'history-'+turn,source,content:[{type:'text',text:turn===1?'历史原文完整保留\n历史第二行':'旧对话 '+turn}]}),'append');
     append('step/end',{turn,step:1});append('turn/end',{turn,reason:{kind:'completed'}});
    }
    append('user/message',createUserMessage({id,source:{kind:'user'},content:[{type:'text',text}]}),'append');return events;
   };
   const a=(await ctx.agents.create({sessionId:'session-aaaa-peer-fixture',meta:{cwd:config.cwd},seed:seed('seed-a','Review fixture')})).agent;
   const b=(await ctx.agents.create({sessionId:'session-bbbb-peer-fixture',meta:{cwd:config.cwd},seed:seed('seed-b','普通用户消息保留')})).agent;
   // This isolated fixture never drives the model. Admission appends real persisted events instead.
   const received=[];
   b.followup=m=>{b.session.append('agent/inbox/spliced',{target:'next-turn',start:received.length,inserted:[m]});received.push(m);};
   b.steer=b.followup;
   ctx.sessionTitle.rename(b.session,'Peer 验收');
   await workspace.attachSession(b.id);
   await ctx.workspaceRegistry.pinSession(b.id);
   const rename=ctx.tools.get('peer_rename');await rename.execute({name:'reviewer'},{agent:a});
   const send=ctx.tools.get('peer_send');
   const items=['检查结束，发现一处需要修复的边界情况。\n目标会话退出后，发送结果需要明确说明未投递。其余检查已完成。','只有一行的结果。','代码检查😀\n```js\nconst value = "中文😀";\n```','```js\nconst firstLineFence = true;\n```','长路径\n'+('/very-long-directory'.repeat(30)),'脚注检查\n参考说明[^1]\n\n[^1]: 脚注正文'];
   let results=[];for(const text of items)results.push(await send.execute({to:'bbbb',text},{agent:a}));
   // The remaining guard lifecycle is covered with a clock-controlled core, no real-minute waits.
   // Pause this actual receiver using user config in the browser profile (longLimit = shortLimit = 6).
   results.push(await send.execute({to:'bbbb',text:'触发接收保护'},{agent:a}));
   const last=results.at(-1);
   let structured;
   const request=ctx.tools.get('peer_request');
   if(request){
    const c=(await ctx.agents.create({sessionId:'session-cccc-peer-fixture',meta:{cwd:config.cwd},seed:seed('seed-c','structured fixture')})).agent;
    await rename.execute({name:'planner'},{agent:c});
    structured=await request.execute({requests:[{to:'bbbb',text:'协议任务已交接。\n只保留新增检查事项。'}]},{agent:c,concludeTurn(){}});
   }
   const turn=config.history?251:1;
   b.session.append('turn/start',{turn});
   b.session.append('agent/inbox/spliced',{target:'next-turn',start:0,removedCount:received.length,inserted:[]});
   b.session.append('step/start',{turn,step:1});
   for(const message of received)b.session.append('user/message',message,{surfaceOp:'append'});
   b.session.append('tool/call',{turn,step:1,callId:'peer-send-fixture',name:'peer_send',arguments:JSON.stringify({to:'reviewer',text:'触发接收保护'})});
   b.session.append('tool/result',{turn,step:1,message:createToolResultMessage({callId:'peer-send-fixture',content:send.output.render({},last),isError:false}),meta:send.output.presentationMeta?.({},last)||null},{surfaceOp:'append'});
   if(structured){
    b.session.append('tool/call',{turn,step:1,callId:'peer-request-fixture',name:'peer_request',arguments:JSON.stringify({requests:[{to:'bbbb',text:'协议任务已交接。'}]})});
    b.session.append('tool/result',{turn,step:1,message:createToolResultMessage({callId:'peer-request-fixture',content:request.output.render({},structured),isError:false}),meta:request.output.presentationMeta({},structured)},{surfaceOp:'append'});
   }
   b.session.append('step/end',{turn,step:1});
   b.session.append('turn/end',{turn,reason:{kind:'completed'}});
   writeFileSync(config.ready,JSON.stringify({session:b.id,results:results.map(r=>r.ok)}));
  }catch(e){console.error('PEER_FIXTURE_ERROR',e.stack);}
 }; void run();
 return ()=>{};
 });
}
