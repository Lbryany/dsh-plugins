import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import assert from 'node:assert/strict';
const root = process.argv[2];
const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
const usage = JSON.parse(await readFile(join(root, 'model-run/usage.json'), 'utf8'));
const baselineUsage = plan.baselineSource ? JSON.parse(await readFile(join(plan.baselineSource, 'model-run/usage.json'), 'utf8')) : null;
const read = async path => { try { return JSON.parse(await readFile(path, 'utf8')); } catch { return null; } };
const rows = [];
for (let run = 1; run <= 2; run++) for (const task of plan.cases) for (const variant of plan.variants) {
  const id = `${variant}-${run}-${task.id}`, dir = join(variant === 'baseline' && plan.baselineSource ? plan.baselineSource : root, 'episodes', id);
  const result = await read(join(dir, 'result.json'));
  const final = await read(join(dir, 'final.json'));
  const review = await read(join(dir, 'oracle-review.json'));
  const events = final?.snapshot.events ?? [];
  const tools = events.filter(e => e.type === 'tool/call').map(e => e.data.name);
  const actual = (variant === 'baseline' && baselineUsage ? baselineUsage : usage).records.filter(r => r.episode === id && r.status === 'completed');
  const errors = events.filter(e => e.type === 'turn/end' && e.data.reason?.kind === 'error').map(e => e.data.reason.error?.message);
  const answer = events.filter(e => e.type === 'assistant/message' && (e.data.turn > 1 || task.kind === 'negative')).flatMap(e => e.data.message.content).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const submittedInputs = events.filter(e => e.type === 'user/message' && e.data.source?.dshWidget?.record).map(e => e.data.source.dshWidget.record);
  let normalized = review?.normalizedSelection ?? null;
  if (submittedInputs.length) {
    assert.equal(submittedInputs.length, 1, id + ': duplicated admitted input');
    if (normalized !== null) assert.deepEqual(normalized, task.expectedSelection, id + ': reviewed selection differs');
    assert.ok(!JSON.stringify(submittedInputs).includes('privateContent'));
    assert.equal(submittedInputs[0].session, result.sessionId);
    if (review?.providerSelectionCorrect === true) {
      assert.match(review.providerRequest ?? '', /^\d{3}-(?:baseline|candidate)-[12]-IC-E0[1-6]-\d+\.request\.json$/);
      const request = await read(join(root, 'model-run', review.providerRequest));
      assert.ok(request, id + ': reviewed provider body is missing');
      const text = request.messages.map(message => typeof message.content === 'string' ? message.content : message.content.map(block => block.text ?? '').join('\n')).join('\n');
      const matches = [...text.matchAll(/<untrusted_widget_state>\s*([\s\S]*?)\s*<\/untrusted_widget_state>/g)];
      assert.ok(matches.length, id + ': provider body has no current state');
      assert.deepEqual(JSON.parse(matches.at(-1)[1]), submittedInputs[0].context, id + ': actual provider state differs from admitted snapshot');
    }
  }
  const local = await read(join(dir, 'local-oracle.json'));
  const negativePass = task.id === 'IC-N01' ? answer.trim() === '96' && !tools.includes('visualize')
    : task.id === 'IC-N02' ? local?.status === 'passed' && result?.exposedSubmit === false && !result.submitted : false;
  // Answer quality requires an evidence-backed review of every frozen oracle clause.
  // A received message or a durable receipt alone never earns end-to-end credit.
  const continuationAnswerReceived = task.kind === 'positive' && answer.trim().length > 0;
  const completedContinuation = events.some(e => e.type === 'turn/end' && e.data.turn > 1 && e.data.reason?.kind === 'completed');
  const oraclePassed = review?.answerOracleChecks?.length === task.answerOracle.length
    && review.answerOracleChecks.every((check, i) => check.clause === task.answerOracle[i] && check.passed === true && typeof check.evidence === 'string' && check.evidence.length > 0);
  const endToEndPass = task.kind === 'positive' && result?.generated === true && result?.submitted === true
    && continuationAnswerReceived && completedContinuation && oraclePassed && review?.providerSelectionCorrect === true;
  rows.push({ id, variant, run, case: task.id, kind: task.kind, trigger: task.trigger,
    executed: actual.length > 0, discoveredSkill: tools.includes('skill'), generated: result?.generated ?? false,
    submitted: result?.submitted ?? false, admissionSnapshotCorrect: submittedInputs.length === 1 && normalized !== null && review?.providerSelectionCorrect === true,
    normalization: normalized, inputId: submittedInputs[0]?.inputId,
    continuationAnswerReceived, endToEndPass, negativePass,
    providerSelectionCorrect: review?.providerSelectionCorrect ?? null,
    reviewRequired: continuationAnswerReceived && !review,
    requests: actual.length, tokens: actual.reduce((n, r) => n + r.input + r.output, 0),
    status: result?.status ?? 'missing', errors: errors.length ? errors : result?.error ? [result.error] : [],
  });
}
const metrics = Object.fromEntries(plan.variants.map(variant => {
  const group = rows.filter(r => r.variant === variant), positive = group.filter(r => r.kind === 'positive');
  const executedPositive = positive.filter(r => r.executed);
  return [variant, {
    plannedEpisodes: group.length, executedEpisodes: group.filter(r => r.executed).length,
    positiveDiscovery: `${positive.filter(r => r.discoveredSkill).length}/12`,
    positiveGeneration: `${positive.filter(r => r.generated).length}/12`,
    generationAmongExecuted: `${executedPositive.filter(r => r.generated).length}/${executedPositive.length}`,
    admittedSubmissions: positive.filter(r => r.submitted).length,
    exactAdmissionSnapshots: positive.filter(r => r.admissionSnapshotCorrect).length,
    endToEnd: `${positive.filter(r => r.endToEndPass).length}/12`,
    explicit: `${positive.filter(r => r.trigger === 'explicit' && r.endToEndPass).length}/4`,
    implicit: `${positive.filter(r => r.trigger === 'implicit' && r.endToEndPass).length}/8`,
    negativePassed: `${group.filter(r => r.negativePass).length}/4`,
    arithmeticPassed: `${group.filter(r => r.case === 'IC-N01' && r.negativePass).length}/2`,
  }];
}));
const candidates = rows.filter(r => r.variant === 'candidate');
const positives = candidates.filter(r => r.kind === 'positive');
const successes = positives.filter(r => r.endToEndPass).length;
const baselineSuccesses = rows.filter(r => r.variant === 'baseline' && r.endToEndPass).length;
const passed = successes >= 10
  && positives.filter(r => r.trigger === 'explicit' && r.endToEndPass).length === 4
  && positives.filter(r => r.trigger === 'implicit' && r.endToEndPass).length >= 6
  && candidates.filter(r => r.negativePass).length === 4
  && candidates.filter(r => r.case === 'IC-N01' && r.negativePass).length === 2
  && positives.filter(r => r.submitted).every(r => r.providerSelectionCorrect === true)
  && (baselineSuccesses < 10 ? successes >= baselineSuccesses + 2 : successes >= baselineSuccesses);
const incomplete = rows.some(r => !r.executed || r.reviewRequired);
const report = { version: plan.version, status: incomplete ? 'not-passed-incomplete-budget-or-review' : passed ? 'passed' : 'not-passed', model: plan.model,
  thresholdsChanged: false, automaticGenerationRetries: 0, comparisonMode: plan.comparisonMode ?? 'interleaved-two-variants', baselineSource: plan.baselineSource ?? null, priorRuns: plan.priorRuns ?? [],
  totalTokens: usage.totalTokens, providerRequests: usage.requests,
  executedEpisodes: rows.filter(r => r.executed).length, plannedEpisodes: rows.length,
  maxObservedInput: Math.max(...usage.records.filter(r => r.input).map(r => r.input)),
  caveat: 'Official offline tokenizer + framing and 8% margin is an estimate; final provider usage is authoritative. Every answer clause and actual provider selection require review. Unexecuted episodes remain in the denominator.',
  metrics, rows };
await writeFile(join(root, 'model-report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: report.status, totalTokens: report.totalTokens, requests: report.providerRequests, metrics }, null, 2));
