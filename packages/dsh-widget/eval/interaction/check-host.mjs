import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const playwright = await import(process.env.VQ_PLAYWRIGHT_MODULE ?? '/Users/bryanlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const [logFile, output, resume, model] = process.argv.slice(2);
const log = await readFile(logFile, 'utf8');
const url = log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0];
if (!url) throw new Error('Host is not ready');
const browser = await playwright.chromium.launch({ headless: true, executablePath: process.env.VQ_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage();
  await page.goto(url);
  await page.waitForTimeout(1000);
  const api = async (path, body, method = 'POST') => page.evaluate(async ({ path, body, method }) => {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 400)}`);
    return JSON.parse(text);
  }, { path, body, method });
  const control = body => api('/api/widget-eval', body);
  if (resume) {
    const prior = JSON.parse(await readFile(resume, 'utf8'));
    const before = (await control({ op: 'calls' })).length;
    const found = await api('/api/dsh-widget/interaction?session=' + prior.sessionId + '&submissionId=queued-A', undefined, 'GET');
    assert.deepEqual(found, prior.receipt);
    const replay = await api('/api/dsh-widget/interaction', { session: prior.sessionId, submission: { submissionId: 'queued-A', path: '/fixture', intent: '请分析本次已确认选择', modelContent: { plan: 'A', hours: 30 } } });
    assert.deepEqual(replay, prior.receipt);
    await page.waitForTimeout(300);
    assert.equal((await control({ op: 'calls' })).length, before);
    await writeFile(output, JSON.stringify({ status: 'passed', check: 'cold-restart-receipt-and-dedup', found }, null, 2));
    console.log('PASS: cold restart retains receipt and same-ID replay creates no provider request');
  } else {
  const offset = (await control({ op: 'calls' })).length;
  const requests = async () => (await control({ op: 'calls' })).slice(offset);
  const lastContext = call => {
    const text = call.messages.flatMap(m => m.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const matches = [...text.matchAll(/<untrusted_widget_state>\s*([\s\S]*?)\s*<\/untrusted_widget_state>/g)];
    return matches.length ? JSON.parse(matches.at(-1)[1]) : null;
  };
  assert.equal((await api('/api/dsh-widget/interaction', undefined, 'GET')).supported, true);
  const { sessionId } = await control({ op: 'create', model: model ?? 'fixture', cwd: '/private/tmp/dsh-widget-user-input-20261101/workspace' });
  const save = plan => api('/api/dsh-widget/state', { session: sessionId, path: '/fixture', state: { modelContent: { plan }, privateContent: { secret: 'PRIVATE-SENTINEL-123' } } });
  const idle = async () => {
    for (let i = 0; i < 100; i++) {
      const current = await control({ op: 'inspect', session: sessionId });
      if (current.status === 'idle') return current;
      await page.waitForTimeout(50);
    }
    throw new Error('Agent did not become idle');
  };
  await save('A');
  assert.equal((await requests()).length, 0);
  await control({ op: 'prompt', session: sessionId, id: 'ordinary-first', text: '分析当前选择' });
  await idle();
  let calls = await requests();
  assert.deepEqual(lastContext(calls.at(-1)), [{ path: '/fixture', state: { plan: 'A' } }]);
  await control({ op: 'block' });
  await control({ op: 'prompt', session: sessionId, id: 'blocking-turn', text: '等待后继续' });
  await page.waitForTimeout(200);
  const submission = { submissionId: 'queued-A', path: '/fixture', intent: '请分析本次已确认选择', modelContent: { plan: 'A', hours: 30 } };
  const receipt = await api('/api/dsh-widget/interaction', { session: sessionId, submission });
  await save('B');
  const duplicate = await api('/api/dsh-widget/interaction', { session: sessionId, submission });
  assert.deepEqual(duplicate, receipt);
  await control({ op: 'release' });
  const inspected = await idle();
  calls = await requests();
  assert.equal(calls.length, 3);
  assert.ok(!JSON.stringify(calls).includes('PRIVATE-SENTINEL-123'));
  assert.deepEqual(lastContext(calls.at(-1)), [{ path: '/fixture', state: { plan: 'A', hours: 30 } }]);
  await control({ op: 'prompt', session: sessionId, id: 'next-B', text: '这次看最新选择' });
  await idle();
  calls = await requests();
  assert.deepEqual(lastContext(calls.at(-1)), [{ path: '/fixture', state: { plan: 'B' } }]);
  await writeFile(output + '.observed.json', JSON.stringify({ calls }, null, 2));
  // Compare actual Adapter inputs, not only stored snapshots. No model-specific
  // in-history support is needed: every previous message and tool stays identical.
  for (let i = 1; i < calls.length; i++) {
    const before = calls[i - 1], after = calls[i];
    assert.deepEqual(after.messages.slice(0, before.messages.length), before.messages, 'Existing prompt prefix changed');
    assert.deepEqual(after.tools, before.tools, 'Tool definitions changed');
  }
  for (const [index, call] of calls.entries()) {
    assert.ok(!call.messages.some(m => m.role === 'system' && JSON.stringify(m).includes('<untrusted_widget_state>')), 'Widget values leaked into system prompt');
    // Startup may append host runtime-context user messages after the input.
    const added = call.messages.slice(index ? calls[index - 1].messages.length : 0);
    const submitted = added.filter(m => m.role === 'user' && JSON.stringify(m).includes('<untrusted_widget_state>'));
    assert.equal(submitted.length, 1, 'Expected exactly one new user message with its snapshot');
    assert.ok(submitted[0].content[0].text.length > 0, 'Missing user intent');
  }
  await writeFile(output, JSON.stringify({ status: 'passed', sessionId, receipt, calls, snapshot: inspected.snapshot, unchangedHistoricalPrefix: true, model: model ?? 'fixture' }, null, 2));
  console.log(JSON.stringify({ status: 'passed', requests: calls.length, sessionId, output }));
  }
} finally { await browser.close(); }
