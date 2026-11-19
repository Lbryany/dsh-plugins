// Constraint 6: the rewrite is scoped to where the wrapper is mounted. A basic mounted in
// another group or another preset scope keeps sending the original directive.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentEvents } from '@deepseek-ai/dsh-agent';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import LlmRuntime from '@deepseek-ai/dsh-llm';
import { bindScopeParent, createScope, scopeOf } from '@deepseek-ai/dsh-scope';
import * as Wrapper from '../index.js';
import { BASIC, INSTRUCTION, createApp, makeAgent, makeSession, mountGroup, summarizeInput, textOf } from './helpers.mjs';

test('C6 sibling groups: basic in another compaction group still sends the original directive', async (t) => {
  const app = createApp(t);
  const wrapped = mountGroup(app, 'W', (g) => g.plugin(Wrapper, { ...BASIC, instruction: INSTRUCTION }));
  const plain = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC));
  await wrapped.ready();
  await plain.ready();

  const agentW = makeAgent(makeSession('sW'));
  const agentB = makeAgent(makeSession('sB'));
  await wrapped.sibling.compaction.summarize(summarizeInput(agentW.session), agentW);
  await plain.sibling.compaction.summarize(summarizeInput(agentB.session), agentB);
  const [callW, callB] = app.adapterCalls;
  assert.ok(textOf(callW.messages.at(-1)).endsWith(INSTRUCTION));
  assert.ok(textOf(callB.messages.at(-1)).startsWith(Wrapper.DIRECTIVE_PREFIX));
  assert.ok(!textOf(callB.messages.at(-1)).includes(INSTRUCTION));
  // the group's own siblings still see the real llm; only basic sees the proxy
  assert.ok(wrapped.sibling.llm instanceof LlmRuntime);
});

test('C6 preset scopes: automatic compaction is rewritten only for agents of the wrapped preset', async (t) => {
  const app = createApp(t);
  const keyW = { scope: 'preset-W' };
  const keyB = { scope: 'preset-B' };
  const scopeW = createScope(app.root, keyW);
  const scopeB = createScope(app.root, keyB);
  const wrapped = mountGroup(app, 'W', (g) => g.plugin(Wrapper, { ...BASIC, instruction: INSTRUCTION }), scopeW.ctx);
  const plain = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC), scopeB.ctx);
  const engW = await wrapped.ready();
  await plain.ready();
  assert.equal(scopeOf(engW.ctx), keyW);

  for (const [key, expectRewritten] of [[keyW, true], [keyB, false]]) {
    app.reset();
    const agent = makeAgent(makeSession(`auto-${key.scope}`, { openTurn: true }));
    bindScopeParent(agent, key);
    await agentEvents(app.root, agent).waterfall('agent/pre-step', { signal: new AbortController().signal, messages: [], step: 1 }, () => 'inner');
    assert.equal(app.adapterCalls.length, 1, `${key.scope}: one compaction call`);
    assert.equal(app.adapterCalls[0].purpose, 'compaction');
    assert.equal(textOf(app.adapterCalls[0].messages.at(-1)).endsWith(INSTRUCTION), expectRewritten, `${key.scope}: rewritten=${expectRewritten}`);
    assert.equal(app.outerSeen.length, 1, `${key.scope}: root llm/stream listener fired`);
    assert.equal(textOf(app.outerSeen[0].messages.at(-1)).endsWith(INSTRUCTION), expectRewritten);
    assert.ok(agent.session.events.some((e) => e.type === 'compaction/summary'), `${key.scope}: checkpoint written`);
  }
});
