// Test-only local host control. Never install in a user's profile.
import { LlmAdapter } from '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/node_modules/@deepseek-ai/dsh-llm/lib/index.js';
import { readFile } from 'node:fs/promises';
export const name = 'widget-eval-fixture';
export const inject = ['llm', 'sessionController', 'connection', 'workspaceRegistry'];
export function apply(ctx) {
  const calls = [], release = new Map(), generated = new Set();
  let blocked = false;
  class FixtureAdapter extends LlmAdapter {
    async listModels() { return ['fixture', 'fixture-no-history'].map(id => ({ provider: 'widget-fixture', id, name: 'Deterministic ' + id })); }
    async resolveModel(provider, model) { return { ...(await this.listModels()).find(m => m.id === model), context: { contextWindow: 128000 }, defaultMaxTokens: 1000, ...(model === 'fixture-no-history' ? {} : { systemPromptUpdate: 'in-history' }) }; }
    async *stream(options) {
      calls.push(JSON.parse(JSON.stringify({ sessionId: options.sessionId, messages: options.messages, tools: options.tools })));
      if (blocked) await new Promise(resolve => { const key = String(calls.length); release.set(key, resolve); options.signal?.addEventListener('abort', resolve, { once: true }); });
      if (/__FIXTURE_(CARD|PAGE)__/.test(JSON.stringify(options.messages)) && !generated.has(options.sessionId)) {
        generated.add(options.sessionId);
        const args = JSON.stringify({ title: '交互验收卡片', mode: JSON.stringify(options.messages).includes('__FIXTURE_PAGE__') ? 'page' : 'inline', fragment: await readFile(new URL('../../assets/examples/option-comparison.html', import.meta.url), 'utf8') });
        yield { type: 'block-start', index: 0, blockType: 'tool-call' };
        yield { type: 'tool-call-delta', index: 0, id: 'fixture-card', name: 'visualize', argumentsDelta: args };
        yield { type: 'block-end', index: 0, block: { type: 'tool-call', id: 'fixture-card', name: 'visualize', arguments: args } };
        yield { type: 'finish', reason: { kind: 'tool-calls' } }; return;
      }
      const text = 'Fixture response';
      yield { type: 'block-start', index: 0, blockType: 'text' };
      yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } };
      yield { type: 'finish', reason: { kind: 'stop' } };
    }
  }
  ctx.llm.registerAdapter(['widget-fixture'], new FixtureAdapter());
  ctx.connection.fetch.register({ path: '/api/widget-eval', methods: ['POST'], requestBody: 'buffered', fetch: async req => {
    try {
    const body = await req.json();
    let value;
    if (body.op === 'create') {
      const workspace = await ctx.workspaceRegistry.create(body.cwd ?? '/private/tmp/dsh-widget-interaction-design-2026-11-01/workspace', '交互评测');
      value = await ctx.sessionController.create({ workspaceId: workspace.id });
      await ctx.sessionController.selectModel({ sessionId: value.sessionId, provider: body.provider ?? 'widget-fixture', model: body.model ?? 'fixture' });
      if (body.title) await ctx.sessionController.rename({ sessionId: value.sessionId, title: body.title });
    } else if (body.op === 'prompt') value = await ctx.sessionController.prompt({ sessionId: body.session, requestId: body.id, mode: 'queue', content: [{ type: 'text', text: body.text }] }, new AbortController().signal);
    else if (body.op === 'cancel') value = await ctx.sessionController.cancel({ sessionId: body.session });
    else if (body.op === 'fork') {
      value = await ctx.sessionController.fork({ sessionId: body.session });
      if (body.title) await ctx.sessionController.rename({ sessionId: value.sessionId, title: body.title });
    }
    else if (body.op === 'inspect') {
      const found = await ctx.sessionController.resolveAgent(body.session);
      if ('error' in found) throw found.error;
      // dsh 0.2.2 removed sessionController.inspect; state() is the passive read that replaced it.
      const snapshot = typeof ctx.sessionController.inspect === 'function'
        ? await ctx.sessionController.inspect(body.session)
        : await ctx.sessionController.state({ sessionId: body.session }, new AbortController().signal);
      value = { status: found.agent.status, snapshot, calls };
    } else if (body.op === 'block') { blocked = true; value = {}; }
    else if (body.op === 'release') { blocked = false; for (const resolve of release.values()) resolve(); release.clear(); value = {}; }
    else if (body.op === 'calls') value = calls;
    else throw new Error('Unknown fixture operation');
    return new Response(JSON.stringify(value), { headers: { 'content-type': 'application/json' } });
    } catch (error) { return new Response(JSON.stringify({ error: error.message, stack: error.stack }), { status: 500, headers: { 'content-type': 'application/json' } }); }
  } });
}
