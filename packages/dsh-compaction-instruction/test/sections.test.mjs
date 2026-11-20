// Sections extension point (0.2.0): at compaction time the wrapper hands the compacted span to
// listeners of SECTIONS_EVENT and appends the sections they return after the model's summary.
// First the routing: the wrapper runs basic under `ctx.isolate('llm')` + provide when an
// instruction is set, and a listener mounted ANYWHERE else in the app (the root, a sibling
// group, another preset scope) must still receive the call.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { isDeepStrictEqual } from 'node:util';
import { agentEvents } from '@deepseek-ai/dsh-agent';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import LlmRuntime, { CONTEXT_WINDOW_EXCEEDED_CODE } from '@deepseek-ai/dsh-llm';
import { bindScopeParent, createScope } from '@deepseek-ai/dsh-scope';
import * as W from '../index.js';
import * as V01 from './fixtures/index-0.1.0.js';
import { BASIC, INSTRUCTION, createApp, estimate, makeAgent, makeSession, mountGroup, realLog, realMeter, textOf, tick, waitFor } from './helpers.mjs';

// spelled out, not W.SECTIONS_EVENT: this test must fail (not pass vacuously) before the export exists
const EVENT = 'compaction-instruction/sections';
const signal = () => new AbortController().signal;
const preStep = (app, agent) => agentEvents(app.root, agent).waterfall('agent/pre-step', { signal: signal(), messages: [], step: 1 }, () => 'inner');

/** A plugin that records every call of EVENT under `label`, mounted on `parent`. */
function listener(parent, label, seen) {
  parent.plugin({ name: `listener-${label}`, apply(ctx) {
    ctx.on(EVENT, (payload) => { seen.push({ label, agent: payload?.agent }); return undefined; });
  } });
}

for (const instruction of [undefined, INSTRUCTION]) {
  const mode = instruction ? 'instruction set (basic runs under isolate(llm) + a provided llm proxy)' : 'no instruction';
  test(`X0 cross-scope: listeners at the root, in a sibling group and in another preset scope all receive the call (${mode})`, async (t) => {
    const app = createApp(t);
    const seen = [];
    const keyW = { scope: 'preset-W' };
    const keyB = { scope: 'preset-B' };
    const scopeW = createScope(app.root, keyW);
    const scopeB = createScope(app.root, keyB);
    listener(app.root, 'root', seen);
    listener(scopeB.ctx, 'other-preset', seen);
    const group = mountGroup(app, 'W', (g) => {
      const fiber = g.plugin(W, { ...BASIC, ...(instruction ? { instruction } : {}) });
      listener(g, 'same-group-sibling', seen);
      return fiber;
    }, scopeW.ctx);
    await group.ready();

    // automatic compaction (agent/pre-step) of an agent of preset W
    const agent = makeAgent(makeSession('x0', { openTurn: true }));
    bindScopeParent(agent, keyW);
    await preStep(app, agent);
    assert.equal(app.adapterCalls.length, 1, 'one compaction ran');
    assert.deepEqual(seen.map((s) => s.label).sort(), ['other-preset', 'root', 'same-group-sibling']);
    for (const s of seen) assert.equal(s.agent, agent, `${s.label}: payload.agent is the compacting agent`);

    // manual compaction (compactNow) reaches them too
    seen.length = 0;
    const manual = makeAgent(makeSession('x0-manual'));
    await group.sibling.compaction.compactNow(manual, signal());
    assert.deepEqual(seen.map((s) => s.label).sort(), ['other-preset', 'root', 'same-group-sibling']);
    for (const s of seen) assert.equal(s.agent, manual);
  });
}

// ---------------------------------------------------------------------------------------------
// end to end with real Sessions. The consumers below are test stand-ins: the plugin has no
// policy of its own, so each test says what its listener returns.

const HEADING = '## Echo Section (test)';
/** A request with the per-session parts (session id, signal, fresh message ids) normalized. */
const norm = (o) => ({ ...o, sessionId: 'S', signal: undefined, messages: o.messages.map((m) => ({ ...m, id: 'X' })) });
const checkpointEvent = (session) => session.snapshotEvents().findLast((e) => e.type === 'user/message' && e.data.source.kind === 'compact-checkpoint');
const checkpointText = (session) => textOf(checkpointEvent(session).data);
const sectionOf = (text, heading = HEADING) => {
  const at = text.indexOf(`\n\n${heading}\n\n`);
  return at === -1 ? undefined : text.slice(at);
};
const spanTokensOf = (session, seqs) => seqs.reduce((n, seq) => n + estimate(session.deriveEventMessage(session.eventAt(seq))), 0);

/** A session whose user messages are mixed with injected user-role messages and an assistant. */
function story(log) {
  log.system('You are a coding assistant.');
  const s = {};
  s.u1 = log.user('FIRST: build the CSV parser. ' + 'p'.repeat(300));
  log.assistant('ok ' + 'q'.repeat(1500));
  log.user('<runtime-context> time is 10:00', 'runtime-context');
  s.u2 = log.user('SECOND: use tabs, not spaces');
  log.assistant('done ' + 'r'.repeat(1500));
  s.u3 = log.user('THIRD: handle CRLF too');
  log.assistant('done ' + 'r'.repeat(1500));
  s.u4 = log.user('FOURTH: this one stays on the live tail');
  return s;
}

/** Test policy: one section echoing the span's user/message texts, one "[#seq N]" line each. */
function echo(payload, { heading = HEADING } = {}) {
  const lines = payload.shadowed.filter((e) => e?.type === 'user/message' && e.data.source?.kind === 'user').map((e) => `[#seq ${e.seq}]\n${textOf(e.data)}`);
  return lines.length ? { heading, body: lines.join('\n\n'), markers: ['[#'] } : undefined;
}

/**
 * One app: group W (the wrapper, `config`), group B (plain basic), and listeners at the root.
 * `listeners` are plain functions; each call is recorded in `calls`.
 */
async function mounted(t, config, listeners = [], { meter = realMeter } = {}) {
  const app = createApp(t, undefined, { meter });
  const calls = [];
  listeners.forEach((fn, i) => app.root.plugin({ name: `consumer-${i}`, apply(ctx) {
    ctx.on(W.SECTIONS_EVENT, (payload) => { calls.push({ i, payload }); return fn(payload); });
  } }));
  const group = mountGroup(app, 'W', (g) => g.plugin(W, config));
  const plain = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC));
  await group.ready();
  await plain.ready();
  return { app, calls, group, plain, compactNow: (agent, g = group) => g.sibling.compaction.compactNow(agent, signal()) };
}

test('S1 payload: agent, session, trigger "manual", the compacted span, the retained tail, the shadowed events, the model summary and the offered space; the section is appended verbatim as the last block', async (t) => {
  const { app, calls, compactNow } = await mounted(t, { ...BASIC }, [echo]);
  const log = realLog('s1');
  const s = story(log);
  const agent = makeAgent(log.session);
  const result = await compactNow(agent);
  assert.equal(calls.length, 1);
  const p = calls[0].payload;
  assert.equal(p.agent, agent);
  assert.equal(p.session, log.session);
  assert.equal(p.trigger, 'manual');
  assert.deepEqual([...p.span.seqs], result.shadowedSeqs);
  assert.equal(p.span.start, result.shadowedSeqs[0]);
  assert.equal(p.span.end, result.shadowedSeqs.at(-1));
  assert.ok(p.retainedSeqs.includes(s.u4) && !p.span.seqs.includes(s.u4), 'u4 is on the retained tail');
  assert.deepEqual(p.retainedSeqs.filter((seq) => p.span.seqs.includes(seq)), [], 'retainedSeqs never includes a compacted node');
  assert.ok(p.retainedSeqs.length > 0 && p.retainedSeqs.length + p.span.seqs.length >= result.shadowedSeqs.length + 1);
  assert.deepEqual(p.shadowed.map((e) => e.seq), [...p.span.seqs]);
  assert.deepEqual(p.summary.map((b) => b.text), [app.summary]);
  assert.ok(Number.isInteger(p.space.tokens) && p.space.tokens > 0);
  assert.equal(p.space.scale, 1);
  assert.equal(typeof p.space.fits, 'function');
  assert.equal(p.space.estimate('abcd'), estimate({ role: 'user', content: [{ type: 'text', text: 'abcd' }] }));
  assert.ok(p.signal instanceof AbortSignal);
  assert.ok(Object.isFrozen(p) && Object.isFrozen(p.span) && Object.isFrozen(p.space));
  const summaryEvent = log.session.snapshotEvents().find((e) => e.type === 'compaction/summary').data;
  const section = echo(p);
  assert.deepEqual(summaryEvent.summary, [{ type: 'text', text: app.summary }, { type: 'text', text: `\n\n${HEADING}\n\n${section.body}\n` }]);
  assert.ok(checkpointText(log.session).endsWith(`\n\n${HEADING}\n\n${section.body}\n${W.CHECKPOINT_FRAME.close}`));
  for (const seq of [s.u1, s.u2, s.u3]) assert.ok(section.body.includes(textOf(log.session.eventAt(seq).data)));
  assert.deepEqual(app.warnings(W.name), []);
});

test('S2 no listener, or every listener returns nothing: the request and the checkpoint are byte-identical to the released 0.1.0 and to plain basic', async (t) => {
  for (const consumers of [[], [() => undefined, () => null, () => []]]) {
    for (const instruction of [undefined, INSTRUCTION]) {
      const config = { ...BASIC, ...(instruction ? { instruction } : {}) };
      const app = createApp(t, undefined, { meter: realMeter });
      consumers.forEach((fn, i) => app.root.plugin({ name: `c${i}`, apply(ctx) { ctx.on(W.SECTIONS_EVENT, fn); } }));
      const a = mountGroup(app, 'A', (g) => g.plugin(W, config));
      const b = mountGroup(app, 'B', (g) => g.plugin(V01, config));
      const c = mountGroup(app, 'C', (g) => g.plugin(BasicCompactionEngine, BASIC));
      await a.ready(); await b.ready(); await c.ready();
      if (!instruction) assert.ok(a.engine().ctx.llm instanceof LlmRuntime, 'no instruction: the real llm');
      const runs = [];
      for (const g of [a, b, c]) {
        app.reset();
        const log = realLog(`s2-${g.label}`);
        story(log);
        await g.sibling.compaction.compactNow(makeAgent(log.session), signal());
        runs.push({ text: checkpointText(log.session), call: norm(app.adapterCalls[0]), summary: log.session.snapshotEvents().find((e) => e.type === 'compaction/summary').data.summary });
      }
      assert.equal(runs[0].text, runs[1].text, 'checkpoint = 0.1.0');
      assert.ok(isDeepStrictEqual(runs[0].call, runs[1].call), 'request = 0.1.0');
      assert.deepEqual(runs[0].summary, runs[1].summary);
      if (!instruction) assert.equal(runs[0].text, runs[2].text, 'checkpoint = plain basic');
      assert.deepEqual(app.warnings(W.name), []);
    }
  }
});

test('S3 with a section: the summarization request deep-equals plain basic (and an instruction-only wrapper); rawOutput and usage stay the model\'s own', async (t) => {
  for (const instruction of [undefined, INSTRUCTION]) {
    const app = createApp(t, undefined, { meter: realMeter });
    app.usage = { inputTokens: 1000, outputTokens: 20, totalTokens: 1020 };
    // only the U group's agents get a section: the listener gates on the agent, as a real consumer does
    const sectioned = new WeakSet();
    app.root.plugin({ name: 'consumer', apply(ctx) { ctx.on(W.SECTIONS_EVENT, (p) => (sectioned.has(p.agent) ? echo(p) : undefined)); } });
    const withS = mountGroup(app, 'U', (g) => g.plugin(W, { ...BASIC, ...(instruction ? { instruction } : {}) }));
    const without = mountGroup(app, 'P', (g) => (instruction ? g.plugin(V01, { ...BASIC, instruction }) : g.plugin(BasicCompactionEngine, BASIC)));
    await withS.ready(); await without.ready();
    const runs = [];
    for (const g of [withS, without]) {
      app.reset();
      const log = realLog(`s3-${g.label}`);
      story(log);
      const agent = makeAgent(log.session);
      if (g === withS) sectioned.add(agent);
      await g.sibling.compaction.compactNow(agent, signal());
      runs.push({ call: app.adapterCalls[0], outer: app.outerSeen[0], summaryEvent: log.session.snapshotEvents().find((e) => e.type === 'compaction/summary') });
    }
    assert.ok(isDeepStrictEqual(norm(runs[0].call), norm(runs[1].call)), `request identical (instruction ${Boolean(instruction)})`);
    assert.ok(isDeepStrictEqual(norm(runs[0].outer), norm(runs[1].outer)), 'outer llm/stream listener saw the same request');
    const [u, p] = runs.map((r) => r.summaryEvent.data);
    assert.deepEqual(u.rawOutput, p.rawOutput);
    assert.ok(p.usage);
    assert.deepEqual(u.usage, p.usage);
    assert.deepEqual(u.summary.slice(0, -1), p.summary, 'model blocks unchanged');
    assert.equal(u.summary.length, p.summary.length + 1);
    assert.ok(u.summary.at(-1).text.startsWith(`\n\n${HEADING}\n\n`));
  }
});

test('S4 failure isolation: a throwing, rejecting, slow or malformed listener loses only its own section, is not asked again, and is warned about once per kind; the compaction succeeds', async (t) => {
  let slowSignal;
  const second = (p) => ({ heading: '## Second (test)', body: 'second body' });
  const consumers = [
    () => { throw new Error('boom'); },
    async () => { throw new Error('async boom'); },
    (p) => new Promise((resolve) => { slowSignal = p.signal; setTimeout(() => resolve(echo(p)), 400); }),
    () => ({ heading: 'not a heading', body: 'x' }),
    echo,
    second,
  ];
  const { app, calls, compactNow } = await mounted(t, { ...BASIC, sectionTimeoutMs: 60 }, consumers);
  for (let round = 0; round < 2; round += 1) {
    calls.length = 0;
    const log = realLog(`s4-${round}`);
    story(log);
    const r = await compactNow(makeAgent(log.session));
    assert.ok(r, 'compaction succeeded');
    assert.deepEqual(calls.map((c) => c.i), [0, 1, 2, 3, 4, 5], 'each listener called exactly once (failed ones are not re-asked)');
    const text = checkpointText(log.session);
    const echoAt = text.indexOf(`\n\n${HEADING}\n\n`);
    const secondAt = text.indexOf('\n\n## Second (test)\n\nsecond body\n');
    assert.ok(echoAt > 0 && secondAt > echoAt, 'the healthy listeners\' sections, in listener order');
    assert.ok(text.endsWith(`second body\n${W.CHECKPOINT_FRAME.close}`));
    assert.equal(text.split(`\n\n${HEADING}\n\n`).length, 2, 'the slow listener\'s late answer is not appended');
    assert.ok(slowSignal?.aborted, 'the slow listener\'s signal was aborted at its deadline');
  }
  const warned = app.warnings(W.name).map((w) => String(w.args[0]));
  assert.equal(warned.filter((m) => /boom/.test(m)).length, 1, 'errors: one warning per mount, later ones at debug');
  assert.equal(warned.filter((m) => /within 60 ms/.test(m)).length, 1);
  assert.equal(warned.filter((m) => /heading must be/.test(m)).length, 1);
  await tick(450); // let the slow listener's timer settle before teardown
});

test('S5 shrink: sections that do not fit are asked for again with a smaller space; the accepted one keeps the checkpoint smaller than the span; warned once', async (t) => {
  // the listener sizes its body to the offered scale: 1,200 chars at 1 does not fit a ≈ 420-token span
  const sized = (p) => ({ heading: HEADING, body: 'U'.repeat(Math.floor(1200 * p.space.scale)) });
  const { app, calls, compactNow } = await mounted(t, { ...BASIC }, [sized]);
  const log = realLog('s5');
  log.system('sys');
  log.user('U'.repeat(1200));
  log.assistant('a'.repeat(400));
  log.user('tail');
  const r = await compactNow(makeAgent(log.session));
  assert.ok(calls.length >= 2, `asked ${calls.length} times`);
  assert.deepEqual(calls.map((c) => c.payload.space.scale), W.SHRINK_SCALES.slice(0, calls.length));
  for (let i = 1; i < calls.length; i += 1) assert.ok(calls[i].payload.space.tokens < calls[i - 1].payload.space.tokens);
  const section = sectionOf(checkpointText(log.session));
  assert.ok(section, 'a smaller section was accepted');
  assert.equal(section, `\n\n${HEADING}\n\n${'U'.repeat(Math.floor(1200 * calls.at(-1).payload.space.scale))}\n${W.CHECKPOINT_FRAME.close}`, 'the plugin never cuts the text');
  const framed = estimate(checkpointEvent(log.session).data);
  assert.ok(framed < spanTokensOf(log.session, r.shadowedSeqs), `checkpoint ${framed} < span`);
  assert.equal(app.warnings(W.name).length, 1);
  assert.match(String(app.warnings(W.name)[0].args[0]), /accepted at/);
});

test('S5 a listener can fit itself with space.fits() before answering', async (t) => {
  const self = (p) => {
    for (const n of [4000, 2000, 1000, 500, 250, 100]) {
      const s = { heading: HEADING, body: 'V'.repeat(n) };
      if (p.space.fits(s)) return s;
    }
    return undefined;
  };
  const { app, calls, compactNow } = await mounted(t, { ...BASIC }, [self]);
  const log = realLog('s5b');
  log.system('sys');
  log.user('U'.repeat(1200));
  log.assistant('a'.repeat(400));
  log.user('tail');
  await compactNow(makeAgent(log.session));
  assert.equal(calls.length, 1, 'answered the first time');
  assert.ok(sectionOf(checkpointText(log.session)));
  assert.deepEqual(app.warnings(W.name), []);
});

test('S6 size guard: no room even for a small section → left out; the checkpoint is plain basic\'s; warned once', async (t) => {
  const { app, plain, compactNow } = await mounted(t, { ...BASIC }, [(p) => ({ heading: HEADING, body: 'x'.repeat(Math.floor(400 * p.space.scale) + 50) })]);
  const mk = (id) => { const l = realLog(id); l.system('sys'); l.user('U'.repeat(380)); l.assistant('a'.repeat(60)); l.user('tail'); return l; };
  const a = mk('s6a');
  await compactNow(makeAgent(a.session));
  assert.equal(sectionOf(checkpointText(a.session)), undefined);
  const b = mk('s6b');
  await compactNow(makeAgent(b.session), plain);
  assert.equal(checkpointText(a.session), checkpointText(b.session), 'same checkpoint as plain basic');
  assert.equal(app.warnings(W.name).length, 1);
  assert.match(String(app.warnings(W.name)[0].args[0]), /never fit|no room/);
});

test('S6 size guard: a long model summary leaves no room, so the section is left out where it would have made basic reject the checkpoint', async (t) => {
  const { app, compactNow } = await mounted(t, { ...BASIC }, [(p) => ({ heading: HEADING, body: 'y'.repeat(600) })]);
  app.summary = 'S'.repeat(2800); // framed ≈ 810 tokens against a ≈ 920-token span
  const log = realLog('s6c');
  log.system('sys');
  log.user('hello there');
  log.assistant('a'.repeat(3600));
  log.user('tail');
  assert.ok(await compactNow(makeAgent(log.session)), 'compaction succeeded');
  assert.equal(sectionOf(checkpointText(log.session)), undefined);
});

test('S6 size guard: sections are also capped at half of the compacted span', async (t) => {
  const { compactNow } = await mounted(t, { ...BASIC }, [(p) => ({ heading: HEADING, body: 'z'.repeat(Math.floor(3000 * p.space.scale)) })]);
  const log = realLog('s6d');
  log.system('sys');
  log.user('U'.repeat(1600));
  log.assistant('a'.repeat(1600));
  log.user('tail');
  const r = await compactNow(makeAgent(log.session));
  const section = sectionOf(checkpointText(log.session));
  assert.ok(section);
  const sectionTokens = estimate({ role: 'user', content: [{ type: 'text', text: section }] }) - 4;
  assert.ok(sectionTokens <= spanTokensOf(log.session, r.shadowedSeqs) * W.MAX_SPAN_SHARE);
});

test('S6 size guard: the half-of-span cap is part of fits() itself, not only of the offered room: a listener that ignores space.tokens is asked again until it is under half', async (t) => {
  // the first answer is ~0.7 of the span: under basic's own line, over the half cap
  let first;
  const scales = [];
  const greedy = (p) => { first ??= p.space.tokens; scales.push(p.space.scale); return { heading: HEADING, body: 'z'.repeat(Math.floor(first * 4 * 1.4 * p.space.scale)) }; };
  const { app, compactNow } = await mounted(t, { ...BASIC }, [greedy]);
  const log = realLog('s6e');
  log.system('sys');
  log.user('U'.repeat(1600));
  log.assistant('a'.repeat(1600));
  log.user('tail');
  const r = await compactNow(makeAgent(log.session));
  const spanTokens = spanTokensOf(log.session, r.shadowedSeqs);
  const firstSection = { heading: HEADING, body: 'z'.repeat(Math.floor(first * 4 * 1.4)) };
  const framed = (blocks) => estimate({ role: 'user', content: [{ type: 'text', text: W.CHECKPOINT_FRAME.open }, ...blocks, { type: 'text', text: W.CHECKPOINT_FRAME.close }] });
  const modelOnly = framed([{ type: 'text', text: app.summary }]);
  const withFirst = framed([{ type: 'text', text: app.summary }, { type: 'text', text: W.renderSection(firstSection) }]);
  assert.ok(withFirst + W.SIZE_MARGIN_TOKENS < spanTokens, 'the first answer passes basic\'s own size line (only the half cap rejects it)');
  assert.ok(withFirst - modelOnly > spanTokens * W.MAX_SPAN_SHARE, 'the first answer is over half of the span');
  assert.deepEqual(scales, [1, 0.5], 'rejected at 1, accepted at 0.5');
  const section = sectionOf(checkpointText(log.session));
  assert.ok(section);
  assert.ok(estimate({ role: 'user', content: [{ type: 'text', text: section }] }) - 4 <= spanTokens * W.MAX_SPAN_SHARE);
});

test('S6 size guard prices the NEUTRALIZED model summary: marker-like model lines never make basic reject a checkpoint plain basic accepts', async (t) => {
  // the listener declares "[#" as its marker, so every model line "[#i]" grows by one "\" when it is appended
  const marked = (p) => {
    for (const n of [1200, 600, 300, 150, 60, 20]) {
      const s = { heading: HEADING, body: `[#seq 1]\n${'u'.repeat(n)}`, markers: ['[#'] };
      if (p.space.fits(s)) return s;
    }
    return { heading: HEADING, body: '[#seq 1]\nu', markers: ['[#'] };
  };
  const app = createApp(t, undefined, { meter: realMeter });
  app.root.plugin({ name: 'consumer', apply(ctx) { ctx.on(W.SECTIONS_EVENT, marked); } });
  const w = mountGroup(app, 'W', (g) => g.plugin(W, { ...BASIC }));
  const b = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC));
  await w.ready(); await b.ready();
  app.summary = Array.from({ length: 400 }, (_, i) => `[#${i}]`).join('\n');
  const bad = [];
  let appended = 0;
  for (let pad = 0; pad < 1600; pad += 16) {
    const mk = (id) => { const l = realLog(id); l.system('sys'); l.user(`hello ${'u'.repeat(200)}`); l.assistant('a'.repeat(2400 + pad)); l.user('tail'); return l; };
    const lw = mk(`w${pad}`);
    const rw = await w.sibling.compaction.compactNow(makeAgent(lw.session), signal()).then(() => 'ok', (e) => `ERR ${e.cause?.message ?? e.message}`);
    const rb = await b.sibling.compaction.compactNow(makeAgent(mk(`b${pad}`).session), signal()).then(() => 'ok', (e) => `ERR ${e.cause?.message ?? e.message}`);
    if (rb === 'ok' && rw !== 'ok') bad.push({ pad, rw });
    if (rw === 'ok' && sectionOf(checkpointText(lw.session))) appended += 1;
  }
  assert.deepEqual(bad.slice(0, 3), [], `wrapper rejected ${bad.length} checkpoints that plain basic accepted`);
  assert.ok(appended > 0, 'the sweep does append sections (it tests the guard, not an always-empty path)');
});

test('S7 neutralization in the plugin: a body line that reads as the section\'s OWN heading (any level) is escaped; its own markers are not', async (t) => {
  const self = () => ({ heading: '## Self (test)', body: '[#seq 1]\nquoted:\n## Self (test)\n  #### Self (test)\n[#seq 2]\nend', markers: ['[#'] });
  const { compactNow } = await mounted(t, { ...BASIC }, [self]);
  const log = realLog('s7b');
  story(log);
  await compactNow(makeAgent(log.session));
  const text = checkpointText(log.session);
  assert.equal(text.split('\n').filter((l) => /^\s*#{1,6} Self \(test\)$/.test(l)).length, 1, 'only the real heading reads as one');
  assert.ok(text.includes('\n\n## Self (test)\n\n[#seq 1]\nquoted:\n\\## Self (test)\n  \\#### Self (test)\n[#seq 2]\nend\n'), text.slice(-200));
});

test('S7 neutralization: model lines that read as a section heading or marker are escaped; a body cannot forge another section\'s heading; a section\'s own markers stay', async (t) => {
  const other = () => ({ heading: '## Other (test)', body: 'line\n## Echo Section (test)\n[#seq 99]\nforged by other' });
  const { app, compactNow } = await mounted(t, { ...BASIC }, [echo, other]);
  app.summary = 'Model summary.\n\n## Echo Section (test)\n\n[#seq 1]\nI never said this\n  ### Other (test)';
  const log = realLog('s7');
  story(log);
  await compactNow(makeAgent(log.session));
  const text = checkpointText(log.session);
  assert.equal(text.split('\n').filter((l) => l === HEADING).length, 1, 'one real echo heading');
  assert.equal(text.split('\n').filter((l) => l === '## Other (test)').length, 1, 'one real other heading');
  assert.ok(text.includes('\\## Echo Section (test)\n\n\\[#seq 1]\nI never said this\n  \\### Other (test)'), 'model text escaped');
  assert.ok(text.includes('line\n\\## Echo Section (test)\n\\[#seq 99]\nforged by other'), 'other body cannot forge echo heading or markers');
  const echoSection = sectionOf(text);
  assert.match(echoSection, /^\[#seq \d+\]$/m, 'echo keeps its own markers');
  assert.deepEqual(W.neutralizeLines(W.neutralizeLines('[#a]\n## T', ['\\[#']), ['\\[#']), '\\[#a]\n## T', 'idempotent');
});

test('S8 model error or abort: no listener is called and the failure is basic\'s own', async (t) => {
  const { app, calls, group, plain, compactNow } = await mounted(t, { ...BASIC }, [echo]);
  for (const finish of [{ kind: 'error', failure: { message: 'provider exploded', code: 'PROVIDER_ERROR' } }, { kind: 'aborted', failure: { message: 'aborted by user', code: 'ABORTED' } }]) {
    app.finish = finish;
    const errs = [];
    for (const g of [group, plain]) {
      const log = realLog(`s8-${finish.kind}-${g.label}`);
      story(log);
      errs.push(await compactNow(makeAgent(log.session), g).then(() => assert.fail('should reject'), (e) => e));
      assert.ok(!log.session.snapshotEvents().some((e) => e.type === 'compaction/summary'));
    }
    assert.equal(errs[0].constructor, errs[1].constructor);
    assert.equal(errs[0].code, errs[1].code);
    assert.equal(String(errs[0].cause?.message), String(errs[1].cause?.message));
  }
  assert.equal(calls.length, 0);
  app.finish = undefined;
});

test('S9 the compacted span cannot be recognized: no listener is called, nothing appended, warned once', async (t) => {
  const { app, calls, group } = await mounted(t, { ...BASIC }, [echo]);
  const log = realLog('s9');
  story(log);
  const agent = makeAgent(log.session);
  const strange = { messages: [{ role: 'user', content: [{ type: 'text', text: 'not in this session' }] }] };
  for (let i = 0; i < 2; i += 1) {
    const out = await group.engine().summarize(strange, agent, signal());
    assert.deepEqual(out.summary.map((b) => b.text), [app.summary]);
  }
  assert.equal(calls.length, 0);
  assert.equal(app.warnings(W.name).length, 1);
  assert.match(String(app.warnings(W.name)[0].args[0]), /span/);
});

const fakeCheckpoints = (session) => session.events.filter((e) => e.type === 'user/message' && e.data.source?.kind === 'compact-checkpoint').map((e) => textOf(e.data));
// BASIC with the fake adapter's 100,000-token window: threshold = floor(min(100000 × 0.01, 100000 − 0 − 1000)) = 1000
const THRESHOLD = 1000;
/** Section listing the user messages of the span, sized by the offered scale. */
const fakeEcho = (p) => {
  const lines = p.shadowed.filter((e) => e?.type === 'user/message').map((e) => textOf(e.data).slice(0, Math.floor(2000 * p.space.scale)));
  return lines.length ? { heading: HEADING, body: lines.join('\n\n') } : undefined;
};
async function autoRun(t, load, { summary, consumers = [fakeEcho] } = {}) {
  const app = createApp(t);
  if (summary !== undefined) app.summary = summary;
  const calls = [];
  consumers.forEach((fn, i) => app.root.plugin({ name: `c${i}`, apply(ctx) { ctx.on(W.SECTIONS_EVENT, (p) => { calls.push(p); return fn(p); }); } }));
  const group = mountGroup(app, 'G', load);
  await group.ready();
  app.reset();
  const agent = makeAgent(makeSession('auto', { openTurn: true }));
  await preStep(app, agent);
  return { app, agent, calls, n: app.adapterCalls.length, checkpoints: fakeCheckpoints(agent.session) };
}

test('S10 automatic compaction (agent/pre-step): trigger "pressure", the section goes through the instruction proxy, and basic\'s pressure outcome is kept', async (t) => {
  const w = await autoRun(t, (g) => g.plugin(W, { ...BASIC, instruction: INSTRUCTION }));
  const b = await autoRun(t, (g) => g.plugin(V01, { ...BASIC, instruction: INSTRUCTION }), { consumers: [] });
  assert.deepEqual([w.n, b.n], [1, 1], 'one compaction each');
  assert.ok(textOf(w.app.adapterCalls[0].messages.at(-1)).endsWith(INSTRUCTION));
  assert.ok(w.calls.length >= 1 && w.calls.every((p) => p.trigger === 'pressure'));
  const section = sectionOf(w.checkpoints[0]);
  assert.ok(section?.includes('Please refactor module A.'), 'section appended on the automatic path');
  const meterTotal = (s) => s.surface.nodes.reduce((n, seq) => n + Math.ceil(textOf(s.deriveEventMessage(s.eventAt(seq))).length / 4), 0);
  assert.ok(meterTotal(w.agent.session) < THRESHOLD, `below threshold after one compaction (${meterTotal(w.agent.session)})`);
});

test('S10 pressure: an attempt that would not reach the threshold even without sections calls no listener; the converging attempt does; same attempts as basic', async (t) => {
  const summary = (i) => (i % 2 === 0 ? 'B'.repeat(2400) : 'small summary');
  const w = await autoRun(t, (g) => g.plugin(W, { ...BASIC }), { summary });
  const b = await autoRun(t, (g) => g.plugin(BasicCompactionEngine, BASIC), { summary, consumers: [] });
  assert.deepEqual([w.n, b.n], [2, 2]);
  assert.equal(w.checkpoints[0], b.checkpoints[0], 'first attempt: basic\'s checkpoint');
  assert.equal(sectionOf(w.checkpoints[0]), undefined, 'no section on the attempt that does not converge');
  assert.ok(w.calls.length >= 1, 'listener asked on the converging attempt');
  const firstCheckpointSeq = w.agent.session.events.find((e) => e.data?.source?.kind === 'compact-checkpoint').seq;
  assert.ok(w.calls.every((p) => p.span.seqs.includes(firstCheckpointSeq)), 'every call belongs to the second attempt (its span holds the first checkpoint)');
  assert.ok(sectionOf(w.checkpoints[1]), 'the converging attempt carries the section');
});

test('S10 model switch: trigger "model-switch"; context-overflow recovery calls no listener', async (t) => {
  const app = createApp(t);
  const calls = [];
  app.root.plugin({ name: 'c', apply(ctx) { ctx.on(W.SECTIONS_EVENT, (p) => { calls.push(p.trigger); return fakeEcho(p); }); } });
  const g = mountGroup(app, 'W', (c) => c.plugin(W, { ...BASIC }));
  await g.ready();
  const agent = makeAgent(makeSession('switch', { openTurn: true }));
  const config = await agentEvents(app.root, agent).waterfall('agent/request', { signal: signal() }, () => ({ provider: 'fake', model: 'm2' }));
  assert.deepEqual(config, { provider: 'fake', model: 'm2' });
  assert.ok(calls.length >= 1 && calls.every((k) => k === 'model-switch'), JSON.stringify(calls));
  calls.length = 0;
  const overflow = makeAgent(makeSession('overflow', { openTurn: true }));
  const decision = await agentEvents(app.root, overflow).waterfall('agent/request-error', { failure: { code: CONTEXT_WINDOW_EXCEEDED_CODE, message: 'too long' }, signal: signal() }, () => 'not handled');
  assert.deepEqual(decision, { kind: 'retry' });
  assert.deepEqual(calls, []);
  assert.equal(sectionOf(fakeCheckpoints(overflow.session)[0] ?? ''), undefined);
});

test('S11 several listeners share the room in registration order: the later one is offered what the earlier one left', async (t) => {
  const first = (p) => ({ heading: '## First (test)', body: 'f'.repeat(800) });
  const { calls, compactNow } = await mounted(t, { ...BASIC }, [first, echo]);
  const log = realLog('s11');
  story(log);
  await compactNow(makeAgent(log.session));
  assert.deepEqual(calls.map((c) => c.i), [0, 1]);
  assert.ok(calls[1].payload.space.tokens < calls[0].payload.space.tokens, `${calls[1].payload.space.tokens} < ${calls[0].payload.space.tokens}`);
  const text = checkpointText(log.session);
  assert.ok(text.indexOf('\n\n## First (test)\n\n') < text.indexOf(`\n\n${HEADING}\n\n`));
});

test('S15 a cancelled compaction is not held up by a listener that ignores its signal: the call is abandoned at the abort, not at sectionTimeoutMs', async (t) => {
  const ctrl = new AbortController();
  let called = false;
  const stubborn = () => { called = true; setTimeout(() => ctrl.abort(new Error('user cancelled')), 20); return new Promise(() => {}); };
  const { app, group } = await mounted(t, { ...BASIC, sectionTimeoutMs: 3000 }, [stubborn]);
  const log = realLog('s15');
  story(log);
  const t0 = Date.now();
  const outcome = await group.sibling.compaction.compactNow(makeAgent(log.session), ctrl.signal).then(() => 'resolved', () => 'rejected');
  const ms = Date.now() - t0;
  assert.ok(called, 'the listener was called');
  assert.ok(ms < 1000, `settled ${ms} ms after start (outcome ${outcome}); sectionTimeoutMs is 3000`);
  assert.equal(checkpointEvent(log.session), undefined, 'no checkpoint committed for the cancelled compaction');
  assert.deepEqual(app.warnings(W.name), [], 'a cancelled compaction is not logged as the listener\'s failure');
});

test('S12 config: sectionTimeoutMs is this plugin\'s key (validated, never passed to basic); any other key, userMessages included, is basic\'s and basic rejects unknown ones with an error naming the key', async (t) => {
  assert.deepEqual(W.splitConfig({ ...BASIC, sectionTimeoutMs: 250 }).basicConfig, BASIC);
  assert.equal(W.splitConfig({ ...BASIC, sectionTimeoutMs: 250 }).timeoutMs, 250);
  assert.equal(W.splitConfig({ ...BASIC }).timeoutMs, W.DEFAULT_SECTION_TIMEOUT_MS);
  for (const bad of [0, -1, 1.5, '100']) assert.throws(() => W.splitConfig({ sectionTimeoutMs: bad }), /sectionTimeoutMs/);
  assert.deepEqual(W.splitConfig({ ...BASIC, userMessages: { budgetChars: 6000 } }).basicConfig, { ...BASIC, userMessages: { budgetChars: 6000 } }, 'the plugin has no opinion on other keys');
  assert.doesNotMatch(readFileSync(new URL('../index.js', import.meta.url), 'utf8'), /userMessages/, 'the plugin knows nothing about user messages');
  const app = createApp(t);
  mountGroup(app, 'W', (g) => g.plugin(W, { ...BASIC, userMessages: true }));
  await waitFor(() => app.errors().length > 0, 'mount error logged');
  await tick(30);
  assert.equal(app.impls('compaction').length, 0);
  const err = app.errors().map((e) => e.args.map((a) => (a instanceof Error ? `${a.message} ${a.cause?.message ?? ''}` : String(a))).join(' ')).join('\n');
  assert.match(err, /userMessages/, `the mount error names the unknown key: ${err.slice(0, 300)}`);
  assert.throws(() => W.normalizeSections({ heading: '## ok', body: '' }), /body/);
  assert.throws(() => W.normalizeSections({ heading: '## ok', body: 'b', markers: ['a\nb'] }), /markers/);
  assert.throws(() => W.normalizeSections({ heading: '# two\nlines', body: 'b' }), /heading/);
  assert.deepEqual(W.normalizeSections(null), []);
});

test('S13 config update and dispose leave nothing behind (listeners stay the consumer\'s own)', async (t) => {
  const app = createApp(t, undefined, { meter: realMeter });
  app.root.plugin({ name: 'consumer', apply(ctx) { ctx.on(W.SECTIONS_EVENT, echo); } });
  await tick();
  const baseline = { hooks: app.hookCount(), llm: app.impls('llm').length, compaction: app.impls('compaction').length };
  const g = mountGroup(app, 'W', (c) => c.plugin(W, { ...BASIC }));
  let engine = await g.ready();
  const run = async () => {
    const log = realLog(`s13-${Math.random()}`);
    story(log);
    await g.sibling.compaction.compactNow(makeAgent(log.session), signal());
    return sectionOf(checkpointText(log.session));
  };
  assert.ok(await run());
  const before = engine;
  await g.fiber.update({ ...BASIC, instruction: INSTRUCTION });
  engine = await waitFor(() => { const e = g.engine(); return e && e !== before && e; }, 'restarted engine');
  assert.ok(await run());
  assert.equal(app.impls('compaction').length, baseline.compaction + 1);
  assert.equal(app.hooks('agent/pre-step'), 1);
  await g.fiber.dispose();
  await tick();
  assert.equal(app.impls('compaction').length, baseline.compaction);
  assert.equal(app.impls('llm').length, baseline.llm);
  assert.equal(app.hookCount(), baseline.hooks);
  assert.deepEqual(app.errors(), []);
});

test('S14 package.json advertises the extension point (consumers check it without importing the plugin)', async () => {
  const { readFileSync } = await import('node:fs');
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  assert.deepEqual(pkg.compactionSections, { event: W.SECTIONS_EVENT, version: 1 });
  assert.equal(W.SECTIONS_EVENT, EVENT);
});
