import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
export const inject = ['agents', 'llm', 'sessions'];
export function apply(ctx, config) {
  let agent, timer, working = false, lastCommand;
  const report = existsSync(config.report) ? JSON.parse(readFileSync(config.report, 'utf8')) : { events: [], calls: [], boot: 0 };
  report.boot++; report.ready = false; delete report.error;
  const handled = new Set();
  const save = () => {
    if (agent) report.received = agent.session.deriveMessages().filter(m => m.source?.hub).map(m => ({ id: m.source.hub.messageId, source: m.source, content: m.content }));
    writeFileSync(config.report, JSON.stringify(report, null, 2));
  };
  class Scripted extends LlmAdapter {
    async *stream(opts) {
      const incoming = agent.session.deriveMessages().filter(m => m.role === 'user' && ['user', 'dsh-peer'].includes(m.source?.kind)).at(-1);
      const text = (incoming?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const source = incoming?.source, exchange = source?.exchange;
      const identity = incoming?.id || text;
      let calls = [];
      if (!handled.has(identity)) {
        handled.add(identity);
        if (exchange?.kind === 'request') calls = [['peer_reply', { requestId: exchange.requestId, kind: 'question', text: '使用哪个分支？' }]];
        else if (exchange?.kind === 'question') calls = [['peer_reply', { requestId: exchange.requestId, questionId: exchange.questionId, kind: 'answer', text: '检查 main 分支。' }]];
        else if (exchange?.kind === 'answer') calls = [['peer_reply', { requestId: exchange.requestId, kind: 'result', text: '审查完成\nmain 分支检查通过。' }]];
        else if (text.startsWith('task:')) calls = [['peer_request', { to: 'reviewer', text: text.slice(5) }]];
        else if (text === 'discover') calls = [['peer_list', {}]];
        else if (text.startsWith('send:')) calls = [['peer_send', { to: 'reviewer', text: text.slice(5) }]];
      }
      report.calls.push({ boot: report.boot, incoming: identity, kind: exchange?.kind || 'user', calls: calls.map(([name, args]) => ({ name, args })), messages: opts.messages }); save();
      let index = 0;
      for (const [name, args] of calls) {
        const block = { type: 'tool-call', id: `hub-${report.boot}-${report.calls.length}-${index}`, name, arguments: JSON.stringify(args) };
        yield { type: 'block-start', index, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index, id: block.id, name, argumentsDelta: block.arguments };
        yield { type: 'block-end', index, block }; index++;
      }
      if (!calls.length) {
        const block = { type: 'text', text: exchange?.kind === 'result' ? '用户任务完成。' : '已读取。' };
        yield { type: 'block-start', index: 0, blockType: 'text' }; yield { type: 'text-delta', index: 0, text: block.text }; yield { type: 'block-end', index: 0, block };
      }
      yield { type: 'finish', reason: { kind: calls.length ? 'tool-calls' : 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['peer-hub-script'], new Scripted());
  ctx.on('session/event', (s, e) => { if (s.header.id === config.sessionId && ['user/message', 'tool/result', 'turn/end'].includes(e.type)) { report.events.push(e); save(); } });
  ctx.effect(() => {
    void (async () => {
      try {
        await new Promise(r => setTimeout(r, 350));
        const options = { sessionId: config.sessionId, agentOptions: { provider: 'peer-hub-script', model: config.name } };
        const resuming = existsSync(config.marker);
        const handle = resuming ? await ctx.agents.resume({ resumeSessionId: config.sessionId, agentOptions: options.agentOptions }) : await ctx.agents.create({ ...options, meta: { cwd: config.cwd } });
        agent = handle.agent;
        if (!resuming) { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: 'seed' }] })); await agent.whenIdle(); }
        await ctx.sessions.flush(agent.session); writeFileSync(config.marker, 'created'); report.ready = true; save();
        timer = setInterval(() => { void (async () => {
          if (working || !existsSync(config.command)) return;
          const command = JSON.parse(readFileSync(config.command, 'utf8'));
          if (command.id === lastCommand) return;
          lastCommand = command.id; working = true;
          try { agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: command.text }] })); await agent.whenIdle(); await ctx.sessions.flush(agent.session); report.command = command.id; save(); }
          catch (e) { report.error = e.stack; save(); }
          finally { working = false; }
        })(); }, 50);
      } catch (error) { report.error = error.stack; save(); }
    })();
    return () => clearInterval(timer);
  });
}
