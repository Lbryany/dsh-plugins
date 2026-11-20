// Upgrade tripwire: the wrapper recognizes basic's directive by its leading text. If the
// INSTALLED dsh-compaction-basic rewords it, this test fails before users silently lose
// their instruction (the wrapper would only warn and pass through).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import { CHECKPOINT_FRAME, DIRECTIVE_PREFIX } from '../index.js';
import { BASIC, createApp, makeAgent, makeSession, mountGroup, realLog, realMeter, summarizeInput } from './helpers.mjs';

const require = createRequire(import.meta.url);

test('tripwire: installed dsh-compaction-basic still ends its compaction call with a single-text user directive starting with DIRECTIVE_PREFIX', async (t) => {
  const pkg = JSON.parse(readFileSync(require.resolve('@deepseek-ai/dsh-compaction-basic/package.json'), 'utf8'));
  t.diagnostic(`installed @deepseek-ai/dsh-compaction-basic ${pkg.version}`);
  const app = createApp(t);
  const plain = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC));
  await plain.ready();
  const agent = makeAgent(makeSession('s'));
  await plain.sibling.compaction.summarize(summarizeInput(agent.session), agent);
  assert.equal(app.adapterCalls.length, 1);
  const call = app.adapterCalls[0];
  assert.equal(call.purpose, 'compaction');
  const last = call.messages.at(-1);
  assert.equal(last.role, 'user');
  assert.equal(last.content.length, 1);
  assert.equal(last.content[0].type, 'text');
  assert.ok(last.content[0].text.startsWith(DIRECTIVE_PREFIX), `directive now starts with: ${JSON.stringify(last.content[0].text.slice(0, 80))}`);
});

test('tripwire: the checkpoint framing copied into CHECKPOINT_FRAME is what the installed basic writes, and the overridden hooks still exist', async (t) => {
  const app = createApp(t, undefined, { meter: realMeter });
  const plain = mountGroup(app, 'B', (g) => g.plugin(BasicCompactionEngine, BASIC));
  await plain.ready();
  const log = realLog('frame');
  log.system('sys');
  log.user('Please refactor module A. ' + 'details '.repeat(200));
  log.assistant('done ' + 'log '.repeat(200));
  log.user('tail');
  await plain.sibling.compaction.compactNow(makeAgent(log.session), new AbortController().signal);
  const checkpoint = log.session.snapshotEvents().find((e) => e.type === 'user/message' && e.data.source.kind === 'compact-checkpoint').data;
  assert.equal(checkpoint.content[0].text, CHECKPOINT_FRAME.open);
  assert.equal(checkpoint.content.at(-1).text, CHECKPOINT_FRAME.close);
  assert.deepEqual(checkpoint.content.slice(1, -1), [{ type: 'text', text: app.summary }], 'summary blocks sit between the two frame blocks');
  for (const hook of ['summarize', 'compactPressure', 'compactIfNeeded']) assert.equal(typeof BasicCompactionEngine.prototype[hook], 'function', hook);
});
