import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';

export const inject = ['agents', 'tools', 'llm', 'sessionTitle', 'workspaceRegistry'];
export function apply(ctx, config) {
  const body = '检查完成😀，修复位于边界判断。\n\n```js\nconst result = "中文😀";\n```\n\n第二项证据：回归已通过。';
  const thought = 'PEER_THINKING_FIXTURE：逐项核对输入和边界后，回复协作会话。';
  const normal = '普通助手回复保持可见。';
  let calls = 0, receiver;
  const events = [];
  ctx.on('session/event', (session, event) => { if (session.header.id === 'session-reply-reviewer') events.push(event); });
  class Scripted extends LlmAdapter {
    async *stream() {
      calls++;
      if (calls === 1) {
        const block = { type: 'text', text: normal };
        yield {type:'block-start',index:0,blockType:'text'};
        yield {type:'text-delta',index:0,text:normal};
        yield {type:'block-end',index:0,block};
        yield {type:'finish',reason:{kind:'stop'}};
        return;
      }
      assert.equal(calls, 2, 'peer_reply must not need an extra model request to display its text');
      const incoming = receiver.session.deriveMessages().filter(m => m.source?.exchange?.kind === 'request').at(-1);
      assert.ok(incoming);
      const reasoning = {type:'reasoning',text:thought};
      yield {type:'block-start',index:0,blockType:'reasoning'};
      yield {type:'reasoning-delta',index:0,text:thought};
      yield {type:'block-end',index:0,block:reasoning};
      const block = {type:'tool-call',id:'reply-visible-call',name:'peer_reply',arguments:JSON.stringify({requestId:incoming.source.exchange.requestId,kind:'result',text:body})};
      yield {type:'block-start',index:1,blockType:'tool-call'};
      yield {type:'tool-call-delta',index:1,id:block.id,name:block.name,argumentsDelta:block.arguments};
      yield {type:'block-end',index:1,block};
      yield {type:'finish',reason:{kind:'tool-calls'}};
    }
  }
  ctx.llm.registerAdapter(['reply-script'], new Scripted());
  ctx.effect(() => {
    void (async () => {
      try {
        const workspace = await ctx.workspaceRegistry.create(config.cwd, 'Peer 回复测试');
        const seed = () => [{seq:0,time:Date.now(),type:'user/message',surfaceOp:'append',data:createUserMessage({source:{kind:'user'},content:[{type:'text',text:'seed'}]})}];
        const sender = (await ctx.agents.create({sessionId:'session-reply-sender',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'reply-script',model:'sender'}})).agent;
        // Leave the sender's delivered result queued; only the receiver drives the scripted model.
        sender.followup = m => sender.send(m, 'next-turn', false);
        receiver = (await ctx.agents.create({sessionId:'session-reply-reviewer',meta:{cwd:config.cwd},seed:seed(),agentOptions:{provider:'reply-script',model:'reviewer'}})).agent;
        ctx.sessionTitle.rename(receiver.session, 'Peer 回复可见性验收');
        await workspace.attachSession(receiver.id);
        await ctx.workspaceRegistry.pinSession(receiver.id);
        receiver.followup(createUserMessage({source:{kind:'user'},content:[{type:'text',text:'先显示普通助手回复'}]}));
        await receiver.whenIdle();
        const sent = await ctx.tools.get('peer_request').execute({to:receiver.id,text:'检查边界并回复结果'}, {agent:sender,concludeTurn(){}});
        assert.equal(sent.ok,true);
        await receiver.whenIdle();
        assert.equal(calls,2);
        const replies=events.filter(e=>e.type==='tool/result'&&e.data.message.toolCallId==='reply-visible-call');
        assert.equal(replies.length,1);
        assert.equal(replies[0].data.meta.peerExchange.ok,true);
        assert.ok(events.some(e=>e.type==='assistant/message'&&e.data.message.content.some(b=>b.type==='reasoning'&&b.text===thought)));
        writeFileSync(config.ready,JSON.stringify({ok:true,calls,body,thought,normal,events},null,2));
      } catch(e) { writeFileSync(config.ready,JSON.stringify({ok:false,error:e.stack,calls,events},null,2)); }
    })();
    return () => {};
  });
}
