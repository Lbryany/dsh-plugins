// Upgrade tripwire: the wrapper recognizes basic's directive by its leading text. If the
// INSTALLED dsh-compaction-basic rewords it, this test fails before users silently lose
// their instruction (the wrapper would only warn and pass through).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import BasicCompactionEngine from '@deepseek-ai/dsh-compaction-basic';
import { DIRECTIVE_PREFIX } from '../index.js';
import { BASIC, createApp, makeAgent, makeSession, mountGroup, summarizeInput } from './helpers.mjs';

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
