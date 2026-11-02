import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pw = await import(process.env.VQ_PLAYWRIGHT_MODULE ?? '/Users/bryanlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const [logFile, evidence, mode] = process.argv.slice(2);
const login = (await readFile(logFile, 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)[0];
const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.VQ_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage(); await page.goto(login); await page.waitForTimeout(800);
  const api = (path, body, method = 'POST') => page.evaluate(async ({ path, body, method }) => {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    if (!r.ok) throw new Error('HTTP ' + r.status); return r.json();
  }, { path, body, method });
  const control = body => api('/api/widget-eval', body);
  if (mode === 'prepare') {
    const { sessionId } = await control({ op: 'create' });
    const save = plan => api('/api/dsh-widget/state', { session: sessionId, path: '/restart', state: { modelContent: { plan }, privateContent: { sentinel: 'PRIVATE-RESTART' } } });
    await save('A'); await control({ op: 'block' });
    await control({ op: 'prompt', session: sessionId, id: 'block-before-restart', text: '等待' });
    await page.waitForTimeout(150);
    const submission = { submissionId: 'across-restart', path: '/restart', intent: '分析本次选择', modelContent: { plan: 'A', hours: 30 } };
    const receipt = await api('/api/dsh-widget/interaction', { session: sessionId, submission });
    await save('B');
    await writeFile(evidence, JSON.stringify({ sessionId, receipt, submission, status: 'queued-before-restart' }, null, 2));
    console.log('Prepared durable queued A after draft changed to B');
  } else {
    const prior = JSON.parse(await readFile(evidence, 'utf8'));
    assert.deepEqual(await api('/api/dsh-widget/interaction?session=' + prior.sessionId + '&submissionId=across-restart', undefined, 'GET'), prior.receipt);
    await control({ op: 'prompt', session: prior.sessionId, id: 'ordinary-after-restart', text: '这次看已保存状态' });
    let current;
    for (let i = 0; i < 100; i++) {
      current = await control({ op: 'inspect', session: prior.sessionId });
      if (current.status === 'idle') break;
      await page.waitForTimeout(50);
    }
    const contexts = current.calls.map(call => {
      const text = call.messages.flatMap(m => m.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
      const matches = [...text.matchAll(/<untrusted_widget_state>\s*([\s\S]*?)\s*<\/untrusted_widget_state>/g)];
      return matches.length ? JSON.parse(matches.at(-1)[1]) : null;
    });
    await writeFile(evidence + '.resumed.json', JSON.stringify({ status: 'checking', contexts, snapshot: current.snapshot }, null, 2));
    assert.ok(contexts.some(rows => rows?.some(row => row.path === '/restart' && row.state.plan === 'A' && row.state.hours === 30)), 'Queued A was not delivered after restart');
    assert.deepEqual(contexts.at(-1), [{ path: '/restart', state: { plan: 'B' } }]);
    assert.ok(!JSON.stringify(current.calls).includes('PRIVATE-RESTART'));
    await writeFile(evidence + '.resumed.json', JSON.stringify({ status: 'passed', contexts, snapshot: current.snapshot }, null, 2));
    console.log('PASS: pending A survives host restart; later ordinary input uses B');
  }
} finally { await browser.close(); }
