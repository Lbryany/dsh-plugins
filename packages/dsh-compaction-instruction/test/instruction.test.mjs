import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { agentEvents } from '@deepseek-ai/dsh-agent';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import * as Wrapper from '../index.js';
import { BASIC, INSTRUCTION, createApp, makeAgent, makeSession, mountGroup, summarizeInput, textOf, tick, waitFor } from './helpers.mjs';

const { DIRECTIVE_PREFIX } = Wrapper;
const drain = async (iterable) => { for await (const _ of iterable); };
/** Everything basic sends except the final directive message (sessionId differs by design). */
const envelope = (o) => ({
  provider: o.provider, model: o.model, purpose: o.purpose, maxTokens: o.maxTokens,
  tools: o.tools, toolHistory: o.toolHistory, prefix: o.messages.slice(0, -1),
  keys: Object.keys(o).sort(),
});

/** One wrapped group and one directly mounted basic group, summarizing the same input. */
async function pair(t, wrapperConfig) {
  const app = createApp(t);
  const wrapped = mountGroup(app, 'W', (g) => g.plugin(Wrapper, wrapperConfig));
  const plain = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC));
  await wrapped.ready();
  await plain.ready();
  const summarizeBoth = async () => {
    app.reset();
    const agentW = makeAgent(makeSession('sW'));
    const agentB = makeAgent(makeSession('sB'));
    await wrapped.sibling.compaction.summarize(summarizeInput(agentW.session), agentW);
    await plain.sibling.compaction.summarize(summarizeInput(agentB.session), agentB);
    assert.equal(app.adapterCalls.length, 2);
    return app.adapterCalls.slice();
  };
  return { app, wrapped, plain, summarizeBoth };
}

test('C1 proxy is a plain object with no symbol keys, and a root llm/stream listener still fires for the wrapped call and sees the rewritten message', async (t) => {
  const { app, wrapped } = await pair(t, { ...BASIC, instruction: INSTRUCTION });
  const proxied = wrapped.engine().ctx.llm;
  assert.ok(!(proxied instanceof LlmRuntime), 'basic sees the proxy, not an LlmRuntime');
  assert.equal(Object.getPrototypeOf(proxied), Object.prototype, 'plain object, not Object.create(llm)');
  assert.deepEqual(Object.getOwnPropertySymbols(proxied), []);
  for (const sym of Object.getOwnPropertySymbols(app.realLlm())) assert.equal(proxied[sym], undefined, `symbol ${String(sym)} not forwarded`);
  assert.equal(typeof proxied.stream, 'function');

  app.reset();
  const agent = makeAgent(makeSession('s1'));
  await wrapped.sibling.compaction.summarize(summarizeInput(agent.session), agent);
  assert.equal(app.adapterCalls.length, 1);
  assert.equal(app.outerSeen.length, 1, 'outer llm/stream listener fired for the wrapped compaction call');
  assert.ok(textOf(app.outerSeen[0].messages.at(-1)).endsWith(INSTRUCTION), 'outer listener saw the rewritten directive');
  assert.equal(app.outerSeen[0].purpose, 'compaction');
});

test('C1 automatic compaction (basic calls from its own isolated context): a root llm/stream listener still fires and sees the rewritten message', async (t) => {
  // This is the path where a non-plain proxy (Object.create(llm), an LlmRuntime subclass) gets
  // its `.ctx` rebound to basic's isolated context, and the waterfall filter then skips every
  // listener outside it. Calls started from the group sibling above do not exercise it.
  const app = createApp(t);
  const wrapped = mountGroup(app, 'W', (g) => g.plugin(Wrapper, { ...BASIC, instruction: INSTRUCTION }));
  await wrapped.ready();
  app.reset();
  const agent = makeAgent(makeSession('auto', { openTurn: true }));
  await agentEvents(app.root, agent).waterfall('agent/pre-step', { signal: new AbortController().signal, messages: [], step: 1 }, () => 'inner');
  assert.equal(app.adapterCalls.length, 1);
  assert.equal(app.adapterCalls[0].purpose, 'compaction');
  assert.equal(app.outerSeen.length, 1, 'outer llm/stream listener fired for the automatic compaction call');
  assert.ok(textOf(app.outerSeen[0].messages.at(-1)).endsWith(INSTRUCTION), 'outer listener saw the rewritten directive');
  assert.ok(agent.session.events.some((e) => e.type === 'compaction/summary'), 'checkpoint written');
});

test('C2 instruction and mode are stripped before basic sees its config', async (t) => {
  const { wrapped, plain } = await pair(t, { ...BASIC, instruction: INSTRUCTION, mode: 'replace' });
  const config = wrapped.engine().config;
  assert.ok(!('instruction' in config) && !('mode' in config));
  assert.deepEqual(config, plain.engine().config, 'basic resolved the same config as a direct mount');
  assert.equal(config.thresholdRatio, BASIC.thresholdRatio);
  assert.deepEqual(Wrapper.splitConfig({ ...BASIC, instruction: 'x', mode: 'append' }).basicConfig, BASIC);
});

test('C3 a compaction call whose final message is not the known directive passes through unchanged and warns once', async (t) => {
  const { app, wrapped } = await pair(t, { ...BASIC, instruction: INSTRUCTION });
  const proxied = wrapped.engine().ctx.llm;
  app.reset();
  const reworded = [
    { provider: 'fake', model: 'm1', purpose: 'compaction', messages: [{ role: 'user', content: [{ type: 'text', text: 'Summarize the conversation above.' }] }] },
    { provider: 'fake', model: 'm1', purpose: 'compaction', messages: [{ role: 'user', content: [{ type: 'text', text: 'Condense everything so far.' }] }] },
  ];
  for (const options of reworded) await drain(proxied.stream(options));
  assert.equal(app.outerSeen[0], reworded[0], 'forwarded as the identical object');
  assert.equal(app.outerSeen[1], reworded[1]);
  assert.equal(textOf(app.adapterCalls[0].messages.at(-1)), 'Summarize the conversation above.');
  const warnings = app.warnings(Wrapper.name);
  assert.equal(warnings.length, 1, 'warned exactly once');
  assert.match(String(warnings[0].args[0]), /forwarded unchanged/);

  // rewriteOptions on its own: same contract
  let missed = 0;
  assert.equal(Wrapper.rewriteOptions(reworded[0], { instruction: 'X', mode: 'append' }, () => missed++), reworded[0]);
  assert.equal(missed, 1);
});

test('C4 non-compaction calls pass through as the identical options object', async (t) => {
  const { app, wrapped } = await pair(t, { ...BASIC, instruction: INSTRUCTION, mode: 'replace' });
  const proxied = wrapped.engine().ctx.llm;
  app.reset();
  const directive = [{ role: 'user', content: [{ type: 'text', text: `${DIRECTIVE_PREFIX} (but not a compaction call)` }] }];
  const calls = [
    { provider: 'fake', model: 'm1', purpose: 'title', messages: directive },
    { provider: 'fake', model: 'm1', messages: directive },
  ];
  for (const options of calls) await drain(proxied.stream(options));
  assert.equal(app.outerSeen[0], calls[0]);
  assert.equal(app.outerSeen[1], calls[1]);
  assert.equal(textOf(app.adapterCalls[0].messages.at(-1)), `${DIRECTIVE_PREFIX} (but not a compaction call)`);
  assert.equal(app.warnings(Wrapper.name).length, 0);
  // other llm members are forwarded generically (basic uses resolveModelInfo)
  const info = await proxied.resolveModelInfo('fake', 'm1');
  assert.equal(info.context.contextWindow, 100000);
  assert.ok('resolveModelInfo' in proxied);
});

test('C5 append: every message but the last, plus tools/purpose/maxTokens/provider/model, deep-equals a direct basic', async (t) => {
  const { summarizeBoth } = await pair(t, { ...BASIC, instruction: INSTRUCTION });
  const [callW, callB] = await summarizeBoth();
  assert.deepEqual(envelope(callW), envelope(callB));
  assert.equal(textOf(callW.messages.at(-1)), `${textOf(callB.messages.at(-1))}\n\n${INSTRUCTION}`);
  assert.equal(callW.messages.at(-1).role, 'user');
  assert.equal(callW.messages.length, callB.messages.length);
});

test('C5 replace: the directive is replaced, the rest still deep-equals a direct basic', async (t) => {
  const { summarizeBoth } = await pair(t, { ...BASIC, instruction: INSTRUCTION, mode: 'replace' });
  const [callW, callB] = await summarizeBoth();
  assert.deepEqual(envelope(callW), envelope(callB));
  assert.equal(textOf(callW.messages.at(-1)), INSTRUCTION);
  assert.deepEqual(callW.messages.at(-1), { role: 'user', content: [{ type: 'text', text: INSTRUCTION }] });
});

test('end to end: compactNow writes the same checkpoint shape as basic and keeps basic\'s size guard', async (t) => {
  const { app, wrapped, plain } = await pair(t, { ...BASIC, instruction: INSTRUCTION });
  app.reset();
  const agentW = makeAgent(makeSession('sW'));
  const agentB = makeAgent(makeSession('sB'));
  const rW = await wrapped.sibling.compaction.compactNow(agentW, new AbortController().signal);
  const rB = await plain.sibling.compaction.compactNow(agentB, new AbortController().signal);
  const types = (s) => s.events.map((e) => e.type).join(',');
  assert.equal(types(agentW.session), types(agentB.session));
  assert.deepEqual(rW.shadowedSeqs, rB.shadowedSeqs);
  const checkpoint = (s) => textOf(s.events.find((e) => e.type === 'user/message' && textOf(e.data).includes('<compacted-summary>')).data);
  assert.equal(checkpoint(agentW.session), checkpoint(agentB.session));
  assert.ok(textOf(app.adapterCalls[0].messages.at(-1)).endsWith(INSTRUCTION));
  assert.ok(!textOf(app.adapterCalls[1].messages.at(-1)).includes(INSTRUCTION));

  app.summary = 'x'.repeat(40000);
  await assert.rejects(
    wrapped.sibling.compaction.compactNow(makeAgent(makeSession('big')), new AbortController().signal),
    (e) => /summary is not smaller than the shadowed content/.test(String(e?.cause?.message ?? e?.message)),
  );
});

test('C7 config update takes effect, and dispose leaves no compaction impl, no proxy impl and no listeners', async (t) => {
  const app = createApp(t);
  await tick();
  const baseline = { hooks: app.hookCount(), llm: app.impls('llm').length, compaction: app.impls('compaction').length };
  const wrapped = mountGroup(app, 'W', (g) => g.plugin(Wrapper, { ...BASIC, instruction: 'FIRST' }));
  let engine = await wrapped.ready();
  assert.equal(app.impls('llm').length, baseline.llm + 1, 'one isolated proxy llm impl while mounted');
  assert.equal(app.hooks('agent/pre-step'), 1);

  const lastDirective = async () => {
    app.reset();
    const agent = makeAgent(makeSession('u'));
    await wrapped.sibling.compaction.summarize(summarizeInput(agent.session), agent);
    return textOf(app.adapterCalls.at(-1).messages.at(-1));
  };
  assert.ok((await lastDirective()).endsWith('\n\nFIRST'));

  const updateTo = async (config) => {
    const before = engine;
    await wrapped.fiber.update(config);
    engine = await waitFor(() => { const e = wrapped.engine(); return e && e !== before && e; }, 'restarted engine');
  };
  await updateTo({ ...BASIC, instruction: 'SECOND' });
  assert.ok((await lastDirective()).endsWith('\n\nSECOND'), 'instruction change applied');
  await updateTo({ ...BASIC, instruction: 'THIRD', mode: 'replace' });
  assert.equal(await lastDirective(), 'THIRD', 'mode change applied');
  await updateTo({ ...BASIC, instruction: '' });
  assert.ok((await lastDirective()).startsWith(DIRECTIVE_PREFIX), 'empty instruction restores basic');
  assert.ok(engine.ctx.llm instanceof LlmRuntime);
  await updateTo({ ...BASIC, instruction: 'FOURTH', mode: 'replace' });
  assert.equal(await lastDirective(), 'FOURTH');
  assert.equal(app.impls('compaction').length, baseline.compaction + 1, 'one engine after updates');
  assert.equal(app.hooks('agent/pre-step'), 1, 'no duplicate automatic-compaction listener after updates');

  const result = await Promise.race([Promise.resolve(wrapped.fiber.dispose()).then(() => 'disposed'), tick(3000).then(() => 'timeout')]);
  assert.equal(result, 'disposed');
  await tick();
  assert.equal(app.impls('compaction').length, baseline.compaction, 'no compaction impl left');
  assert.equal(app.impls('llm').length, baseline.llm, 'no proxy llm impl left');
  assert.equal(app.hooks('agent/pre-step'), 0);
  // the group's own sibling plugin registers nothing; everything else came from basic + wrapper
  assert.equal(app.hookCount(), baseline.hooks, 'no leftover listeners');
  assert.notEqual(wrapped.sibling.fiber.state, 2, 'dependents of compaction deactivated');
  assert.deepEqual(app.errors(), []);
});

for (const [label, instruction] of [['empty', ''], ['whitespace', '  \n\t '], ['null (blank YAML value)', null], ['omitted', undefined]]) {
  test(`C8 ${label} instruction behaves exactly like basic (no rewrite, real llm)`, async (t) => {
    const config = { ...BASIC, mode: 'replace', ...(instruction === undefined ? {} : { instruction }) };
    const { app, wrapped, summarizeBoth } = await pair(t, config);
    assert.ok(wrapped.engine().ctx.llm instanceof LlmRuntime, 'basic sees the real llm');
    assert.equal(app.impls('llm').length, 1, 'no proxy provided');
    const [callW, callB] = await summarizeBoth();
    assert.ok(isDeepStrictEqual({ ...callW, sessionId: 'S' }, { ...callB, sessionId: 'S' }), 'identical call, including the directive');
    assert.equal(app.warnings(Wrapper.name).length, 0);
  });
}

test('invalid mode or non-string instruction fails the mount instead of guessing', async (t) => {
  assert.throws(() => Wrapper.splitConfig({ instruction: 'x', mode: 'prepend' }), /mode must be/);
  assert.throws(() => Wrapper.splitConfig({ instruction: 42 }), /instruction must be a string/);
  const app = createApp(t);
  mountGroup(app, 'W', (g) => g.plugin(Wrapper, { ...BASIC, instruction: INSTRUCTION, mode: 'prepend' }));
  await waitFor(() => app.errors().length > 0, 'mount error logged');
  await tick(30);
  assert.equal(app.impls('compaction').length, 0);
});
