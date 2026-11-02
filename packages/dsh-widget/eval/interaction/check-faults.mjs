import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pw = await import(process.env.VQ_PLAYWRIGHT_MODULE ?? '/Users/bryanlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root = process.argv[2], report = [];
const login = (await readFile(root + '/host.log', 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0];
const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.VQ_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } }); page.setDefaultTimeout(10000);
  await page.goto(login); await page.waitForTimeout(800);
  if (await page.getByRole('button', { name: '继续', exact: true }).count()) await page.getByRole('button', { name: '继续', exact: true }).click();
  const api = (path, body, method = 'POST') => page.evaluate(async ({ path, body, method }) => {
    const r = await fetch(path, { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    const value = await r.json(); if (!r.ok) throw new Error(JSON.stringify(value)); return value;
  }, { path, body, method });
  const control = body => api('/api/widget-eval', body);
  const create = async mode => {
    const title = '故障验收-' + mode + '-' + Date.now();
    const { sessionId } = await control({ op: 'create', title, cwd: root + '/workspace' });
    await control({ op: 'prompt', session: sessionId, id: 'card', text: mode === 'page' ? '__FIXTURE_PAGE__' : '__FIXTURE_CARD__' });
    await page.waitForTimeout(400); return { title, sessionId };
  };
  const open = async session => {
    await page.getByText('交互评测', { exact: true }).first().click(); await page.waitForTimeout(200);
    if (!await page.getByText(session.title, { exact: true }).count()) {
      const box = await page.getByText('交互评测', { exact: true }).first().boundingBox();
      await page.mouse.click(box.x - 14, box.y + box.height / 2); await page.waitForTimeout(200);
    }
    if (!await page.getByText(session.title, { exact: true }).count() && await page.getByText(/展开其余 .* 个会话/).count()) await page.getByText(/展开其余 .* 个会话/).first().click();
    await page.getByText(session.title, { exact: true }).first().click(); await page.waitForTimeout(400);
  };
  const frame = () => page.frameLocator('iframe:visible').last();
  const bar = () => page.locator('[data-dsh-interaction-bar]:visible').last();
  const dialog = () => page.getByRole('dialog', { name: '确认本次选择' }).filter({ visible: true });
  const slider = () => frame().locator('input[name=hours]');
  const setHours = async value => { await slider().focus(); await slider().press('Home'); for (let i = 0; i < value; i++) await slider().press('ArrowRight'); };
  const calls = async session => (await control({ op: 'calls' })).filter(c => c.sessionId === session.sessionId);
  const lastState = async session => {
    const last = (await calls(session)).at(-1);
    const text = last.messages.flatMap(m => m.content ?? []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    const matches = [...text.matchAll(/<untrusted_widget_state>\s*([\s\S]*?)\s*<\/untrusted_widget_state>/g)];
    return matches.length ? JSON.parse(matches.at(-1)[1]) : [];
  };
  const capture = async () => { await bar().getByRole('button').first().press('Enter'); await dialog().waitFor(); };
  const confirm = async () => { await dialog().getByRole('button', { name: '确认并继续' }).press('Enter'); await page.waitForTimeout(350); };
  async function check(name, run) {
    try { const evidence = await run(); report.push({ name, status: 'passed', evidence }); console.log('PASS ' + name); }
    catch (error) { report.push({ name, status: 'failed', error: error.message.replace(/token=\S+/g, 'token=[REDACTED]') }); console.log('FAIL ' + name + ': ' + error.message.slice(0, 160)); }
    await writeFile(root + '/faults.json', JSON.stringify(report, null, 2));
  }
  const source = await create('inline'); await open(source);
  await check('slow-save-keyboard-capture-and-immutable-preview', async () => {
    let holding = true; const releases = [];
    const handler = async route => { if (route.request().method() === 'POST' && holding) await new Promise(resolve => releases.push(resolve)); await route.continue(); };
    await page.route('**/api/dsh-widget/state*', handler);
    try {
      await frame().locator('select[name=plan]').selectOption('B'); await setHours(30);
      await page.waitForTimeout(1800); await capture();
      assert.match(await dialog().innerText(), /30/); await slider().press('ArrowRight'); await confirm();
      const received = await lastState(source); assert.equal(received.at(-1).state.hours, 30); assert.equal(received.at(-1).state.plan, 'B');
      return { received, laterControl: await slider().inputValue(), delayedSaveMs: 1800 };
    } finally { holding = false; releases.forEach(fn => fn()); await page.waitForTimeout(400); await page.unroute('**/api/dsh-widget/state*', handler); }
  });
  await check('escape-cancels-without-inference', async () => {
    const before = (await calls(source)).length; await capture();
    await dialog().getByRole('button', { name: '取消', exact: true }).press('Escape');
    assert.equal(await dialog().count(), 0); assert.equal((await calls(source)).length, before); return { requestsAdded: 0 };
  });
  await check('disconnect-before-admission-reload-and-same-id-retry', async () => {
    const posts = [], handler = async route => {
      if (route.request().method() !== 'POST') return route.continue();
      posts.push(route.request().postDataJSON());
      if (posts.length === 1) await route.abort('connectionreset'); else await route.continue();
    };
    await page.route('**/api/dsh-widget/interaction*', handler);
    try {
      const before = (await calls(source)).length; await capture(); await confirm();
      assert.match(await bar().innerText(), /待确认/); await page.reload(); await page.waitForTimeout(500); await open(source);
      await bar().getByRole('button', { name: '核实提交状态' }).click();
      await bar().getByRole('button', { name: '重试本次提交' }).click(); await page.waitForTimeout(400);
      assert.equal(posts.length, 2); assert.deepEqual(posts[1], posts[0]); assert.equal((await calls(source)).length, before + 1);
      return { submissionId: posts[0].submission.submissionId, requestsAdded: 1, identicalRetry: true };
    } finally { await page.unroute('**/api/dsh-widget/interaction*', handler); }
  });
  await check('disconnect-after-admission-reload-lookup-without-resend', async () => {
    let posts = 0;
    const handler = async route => { if (route.request().method() !== 'POST') return route.continue(); posts++; await route.fetch(); await route.abort('connectionreset'); };
    await page.route('**/api/dsh-widget/interaction*', handler);
    try {
      const before = (await calls(source)).length; await capture(); await confirm();
      assert.match(await bar().innerText(), /待确认/); await page.reload(); await page.waitForTimeout(500); await open(source);
      await bar().getByRole('button', { name: '核实提交状态' }).click(); await page.waitForTimeout(300);
      assert.match(await bar().innerText(), /提交已接收/); assert.equal(posts, 1); assert.equal((await calls(source)).length, before + 1);
      return { postCount: posts, requestsAdded: 1 };
    } finally { await page.unroute('**/api/dsh-widget/interaction*', handler); }
  });
  await check('failed-save-visible-current-fields-still-captured', async () => {
    const handler = async route => route.request().method() === 'POST' ? route.fulfill({ status: 503, contentType: 'application/json', body: '{"message":"injected unavailable"}' }) : route.continue();
    await page.route('**/api/dsh-widget/state*', handler);
    try {
      await setHours(33); await page.waitForTimeout(500);
      assert.match(await frame().locator('[data-dsh-interaction-status]').innerText(), /保存失败/);
      await capture(); await confirm(); assert.equal((await lastState(source)).at(-1).state.hours, 33);
      return { capturedDespiteFailedDraftSave: 33 };
    } finally { await page.unroute('**/api/dsh-widget/state*', handler); }
  });
  const other = await create('other');
  await check('switch-session-does-not-submit-old-preview', async () => {
    await open(source); const before = (await calls(source)).length; await capture();
    await open(other); assert.equal(await dialog().count(), 0);
    await setHours(12); await capture(); await confirm();
    assert.equal((await calls(source)).length, before); assert.equal((await lastState(other)).at(-1).state.hours, 12);
    return { sourceSession: source.sessionId, targetSession: other.sessionId, sourceRequestsAdded: 0 };
  });
  await check('fork-has-no-parent-receipt-or-new-input-state', async () => {
    const inspected = await control({ op: 'inspect', session: source.sessionId });
    const record = inspected.snapshot.events.find(e => e.type === 'user/message' && e.data.source?.dshWidget?.record).data.source.dshWidget.record;
    const fork = await control({ op: 'fork', session: source.sessionId, title: '分叉验收-' + Date.now() });
    const lookup = await api('/api/dsh-widget/interaction?session=' + fork.sessionId + '&submissionId=' + record.submissionId, undefined, 'GET');
    await control({ op: 'prompt', session: fork.sessionId, id: 'fresh-fork-input', text: '查看分叉的当前状态' }); await page.waitForTimeout(300);
    assert.equal(lookup.receipt, null); assert.deepEqual(await lastState(fork), []);
    return { forkSession: fork.sessionId, parentSubmission: record.submissionId, lookup: null, newInputState: [] };
  });
  const full = await create('page'); await open(full);
  await check('page-collapse-preserves-frame-and-detached-cannot-submit', async () => {
    await page.getByRole('button', { name: '在对话中展开', exact: true }).last().click();
    await setHours(27); const original = await page.locator('iframe:visible').last().elementHandle();
    await page.getByRole('button', { name: '收起', exact: true }).last().click();
    assert.equal(await original.evaluate(el => el.isConnected), true);
    await page.getByRole('button', { name: '在对话中展开', exact: true }).last().click();
    assert.equal(await page.locator('iframe:visible').last().evaluate((el, old) => el === old, original), true);
    assert.equal(await slider().inputValue(), '27');
    const popupPromise = page.context().waitForEvent('page');
    await page.getByRole('button', { name: '打开页面', exact: true }).last().click();
    const popup = await popupPromise; await popup.waitForLoadState(); await popup.waitForTimeout(300);
    assert.equal(await popup.locator('[data-dsh-interaction-bar]').count(), 0);
    assert.match(await popup.frameLocator('iframe').locator('[data-dsh-interaction-status]').innerText(), /返回|不支持|失败/);
    await popup.close(); await capture(); await confirm(); assert.equal((await lastState(full)).at(-1).state.hours, 27);
    return { sameFrame: true, savedHours: 27, detachedSubmitControls: 0 };
  });
  await writeFile(root + '/fault-sessions.json', JSON.stringify({ source, other, full }, null, 2));
  await page.screenshot({ path: root + '/faults.png' });
  if (report.some(row => row.status !== 'passed')) process.exitCode = 1;
} finally { await browser.close(); }
