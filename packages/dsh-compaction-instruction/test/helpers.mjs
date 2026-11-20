// Test harness: real cordis + real dsh-llm LlmRuntime + the INSTALLED dsh-compaction-basic
// (linked by scripts/link-dsh.mjs), with a fake LlmAdapter (no network) and fake
// tokenMeter / sessions / session / agent.
import { Context } from '@deepseek-ai/cordis';
import LlmRuntime, { LlmAdapter, createAssistantMessage, createMessage, createUserMessage } from '@deepseek-ai/dsh-llm';
import { Session } from '@deepseek-ai/dsh-session';
import TokenMeter from '@deepseek-ai/dsh-token-meter';

export const ISO = Context.isolate;
export const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
export const textOf = (m) => (m?.content ?? []).map((b) => b.text ?? '').join('');
export const INSTRUCTION = 'Also add a final section "## Open Questions" that lists every unresolved question verbatim.';
/** Config keys of dsh-compaction-basic, passed straight through by the wrapper. */
export const BASIC = Object.freeze({ thresholdRatio: 0.01, headroomTokens: 1000, retainTokens: 100 });

export async function waitFor(predicate, label, ms = 2000) {
  const end = Date.now() + ms;
  for (;;) {
    const value = predicate();
    if (value) return value;
    if (Date.now() > end) throw new Error(`timed out waiting for ${label}`);
    await tick();
  }
}

class FakeAdapter extends LlmAdapter {
  constructor(app) { super(); this.app = app; }
  resolveModel(provider, model) {
    return Promise.resolve({ provider, id: model, name: model, context: { contextWindow: 100000 } });
  }
  async *stream(options) {
    this.app.adapterCalls.push(options);
    const text = typeof this.app.summary === 'function' ? this.app.summary(this.app.adapterCalls.length - 1) : this.app.summary;
    yield { type: 'block-start', index: 0, blockType: 'text' };
    yield { type: 'text-delta', index: 0, text };
    yield { type: 'block-end', index: 0, block: { type: 'text', text } };
    if (this.app.usage) yield { type: 'usage', usage: this.app.usage };
    // app.finish lets a test end the stream with an error or an abort instead of a stop
    yield { type: 'finish', reason: this.app.finish ?? { kind: 'stop' } };
  }
}

export function makeSession(id, { openTurn = false } = {}) {
  const events = [];
  const surface = { nodes: [], replaceGeneration: 0 };
  const msg = (role, text) => ({ role, content: [{ type: 'text', text }], ...(role === 'assistant' ? { source: { kind: 'model', provider: 'fake', model: 'm1' } } : {}) });
  const s = {
    id,
    events,
    surface,
    get seq() { return events.length; },
    eventAt: (seq) => events[seq],
    requestHeader: () => ({ config: { provider: 'fake', model: 'm1' }, tools: [{ name: 'echo', description: 'e', inputSchema: { type: 'object' } }] }),
    toolHistory: () => [],
    // Real dsh-session shapes: a user/message event's data IS the message; other message
    // events carry it as data.message.
    deriveEventMessage: (ev) => (ev.type === 'user/message' ? ev.data : ev.data?.message) ?? null,
    append(type, data, opts) {
      const ev = { seq: events.length, type, data };
      events.push(ev);
      if (opts?.surfaceOp?.op === 'replace') {
        const a = surface.nodes.indexOf(opts.surfaceOp.startSeq);
        const b = surface.nodes.indexOf(opts.surfaceOp.endSeq);
        surface.nodes.splice(a, b - a + 1, ev.seq);
        surface.replaceGeneration += 1;
      } else if (['system/message', 'user/message', 'assistant/message'].includes(type)) surface.nodes.push(ev.seq);
      return ev;
    },
  };
  const push = (type, message) => s.append(type, type === 'user/message' ? { ...message, source: { kind: 'user' } } : { message });
  push('system/message', msg('system', 'You are a coding assistant.'));
  if (openTurn) s.append('turn/start', { turn: 'turn-1' });
  push('user/message', msg('user', 'Please refactor module A. ' + 'details '.repeat(400)));
  push('assistant/message', msg('assistant', 'Refactored A; changed a.js. ' + 'log '.repeat(400)));
  push('user/message', msg('user', 'Now module B. ' + 'more '.repeat(400)));
  push('assistant/message', msg('assistant', 'Working on B.'));
  return s;
}

const tokenMeter = {
  measure(session) {
    const nodes = session.surface.nodes.map((seq) => {
      const t = Math.ceil(textOf(session.deriveEventMessage(session.eventAt(seq))).length / 4);
      return { seq, tokens: t, heuristicTokens: t };
    });
    return { nodes, totalTokens: nodes.reduce((a, n) => a + n.tokens, 0) };
  },
  estimateMessage: (m) => Math.ceil(textOf(m).length / 4),
};

export const makeAgent = (session) => ({
  session,
  options: { provider: 'fake', model: 'm1' },
  runMaintenance: (fn) => fn(new AbortController().signal),
});

/** dsh-token-meter's own fixed heuristic (UTF-16 length / 4 + 4 per block + 4 per message). */
export const estimate = (message) => TokenMeter.prototype.estimateMessage(message);

/** A meter pricing every surface node with dsh-token-meter's heuristic, for real Sessions. */
export const realMeter = {
  measure(session) {
    const nodes = session.surface.nodes.map((seq) => {
      const m = session.deriveEventMessage(session.eventAt(seq));
      const t = m === null ? 0 : estimate(m);
      return { seq, tokens: t, heuristicTokens: t };
    });
    return { nodes, totalTokens: nodes.reduce((a, n) => a + n.tokens, 0) };
  },
  estimateMessage: estimate,
};

/**
 * A real, detached dsh-session Session (the installed dsh's), with helpers that append real
 * message events. Each helper returns the appended event's seq.
 */
export function realLog(id = 'real') {
  const session = Session.create(id);
  const text = (t) => [{ type: 'text', text: t }];
  return {
    session,
    system: (t) => session.append('system/message', { message: createMessage({ role: 'system', content: text(t), source: { kind: 'system-prompt' } }) }, { surfaceOp: 'append' }).seq,
    user: (t, source = { kind: 'user' }) => session.append('user/message', createUserMessage({ content: typeof t === 'string' ? text(t) : t, source: typeof source === 'string' ? { kind: source } : source }), { surfaceOp: 'append' }).seq,
    assistant: (t) => session.append('assistant/message', { message: createAssistantMessage({ content: text(t), source: { provider: 'fake', model: 'm1' } }) }, { surfaceOp: 'append' }).seq,
  };
}

/** The first three surface messages of a session, as basic's `summarize(input)` takes them. */
export function summarizeInput(session) {
  return {
    tools: session.requestHeader().tools,
    messages: session.surface.nodes.slice(0, 3).map((seq) => session.deriveEventMessage(session.eventAt(seq))),
  };
}

/**
 * A root app with the real llm runtime, a fake adapter, fakes for basic's other injects, an
 * outer `llm/stream` listener at the root (stands in for llm-retry / session-title), and a
 * log exporter. Disposed after the test.
 */
export function createApp(t, root = new Context(), { meter = tokenMeter } = {}) {
  const app = { root, adapterCalls: [], outerSeen: [], logs: [], summary: 'short fake summary', flushed: [] };
  root.logger.exporter({ export: (m) => app.logs.push(m) });
  root.plugin(LlmRuntime);
  root.plugin({ name: 'fake-adapter', inject: ['llm'], apply(ctx) { ctx.llm.registerAdapter(['fake'], new FakeAdapter(app)); } });
  root.plugin({ name: 'fakes', apply(ctx) {
    ctx.provide('tokenMeter', meter);
    ctx.provide('sessions', { flush: async (s) => { app.flushed.push(s.id); } });
  } });
  root.plugin({ name: 'outer-llm-middleware', inject: ['llm'], apply(ctx) {
    ctx.on('llm/stream', (options, next) => { app.outerSeen.push(options); return next(); });
  } });
  app.warnings = (name) => app.logs.filter((m) => m.type === 'warn' && (name === undefined || m.name === name));
  app.errors = () => app.logs.filter((m) => m.type === 'error');
  app.impls = (name) => Reflect.ownKeys(root.reflect.store).map((k) => root.reflect.store[k]).filter((i) => i.name === name);
  app.hookCount = () => Object.values(root.events._hooks).reduce((n, list) => n + (list?.length ?? 0), 0);
  app.hooks = (name) => (root.events._hooks[name] ?? []).length;
  app.realLlm = () => root.reflect.get('llm');
  app.reset = () => { app.adapterCalls.length = 0; app.outerSeen.length = 0; };
  t.after(() => root.fiber.dispose());
  return app;
}

/**
 * Mount a compaction group the way a preset does (`cordis:group` with
 * `isolate: { compaction: true, toolResultPruner: true }`), let `load(g)` mount the engine,
 * and add a sibling that injects `compaction` (stands in for command-compact).
 * `group.sibling` always holds the latest active sibling context.
 */
export function mountGroup(app, label, load, parent = app.root) {
  const group = { label, sibling: undefined, generation: 0, fiber: undefined, groupFiber: undefined };
  group.groupFiber = parent.plugin({ name: `group-${label}`, apply(ctx) {
    const g = ctx.isolate('compaction').isolate('toolResultPruner');
    group.fiber = load(g);
    g.plugin({ name: `sibling-${label}`, inject: ['compaction', 'llm'], apply(c) { group.sibling = c; group.generation += 1; } });
  } });
  group.engine = () => {
    const sib = group.sibling;
    if (!sib || sib.fiber.state !== 2) return undefined;
    return app.impls('compaction').find((i) => i.isolate === sib[ISO].compaction)?.value;
  };
  group.ready = () => waitFor(() => group.engine(), `compaction engine in group ${label}`);
  return group;
}
