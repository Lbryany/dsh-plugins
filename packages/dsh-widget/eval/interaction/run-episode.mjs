// Real isolated dsh session; never preloads the skill or modifies generated HTML.
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { join } from 'node:path';
import { performActions } from './browser-actions.mjs';
const pw = await import(process.env.VQ_PLAYWRIGHT_MODULE ?? '/Users/bryanlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const [root, variant, repetition, caseId, assistance] = process.argv.slice(2);
const uiOnly = assistance === '--resume-ui';
const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
const task = plan.cases.find(c => c.id === caseId);
if (!task || !plan.variants.includes(variant) || !['1', '2'].includes(repetition)) throw new Error('Invalid episode');
const id = `${variant}-${repetition}-${caseId}`;
const output = join(root, 'episodes', id);
let exists = false; try { await access(join(output, 'result.json')); exists = true; } catch {}
if (exists && !uiOnly) throw new Error('Episode already recorded; generation retries are forbidden');
if (uiOnly && !exists) throw new Error('UI assistance requires an existing generation');
const previous = uiOnly ? JSON.parse(await readFile(join(output, 'result.json'))) : null;
if (previous?.submitted) throw new Error('Cannot repeat an already submitted action');
if (uiOnly) await writeFile(join(output, 'result-before-ui-assistance.json'), JSON.stringify(previous, null, 2), { flag: 'wx' }).catch(async error => { if (error.code !== 'EEXIST') throw error; await writeFile(join(output, `result-before-ui-assistance-${Date.now()}.json`), JSON.stringify(previous, null, 2), { flag: 'wx' }); });
await mkdir(output, { recursive: true });
const login = (await readFile(join(root, variant === 'baseline' ? 'baseline-host.log' : 'host.log'), 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)?.[0];
const proxy = JSON.parse(await readFile(join(root, 'model-run/endpoint.json'), 'utf8')).url;
const label = await fetch(proxy + '/episode', { method: 'POST', body: JSON.stringify({ id }) });
if (!label.ok) throw new Error('Previous provider request has not completed');
const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.VQ_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
const result = previous ? { ...previous, status: 'running-ui-assistance', error: undefined, uiAssistance: 'Same generated page, trusted keyboard/semantic control targeting; no generation retry' } : { id, task, startedAt: new Date().toISOString(), actions: [], status: 'running' };
let page, control;
try {
  page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  page.setDefaultTimeout(8000);
  await page.goto(login); await page.waitForTimeout(800);
  if (await page.getByRole('button', { name: '继续', exact: true }).count()) await page.getByRole('button', { name: '继续', exact: true }).click();
  control = body => page.evaluate(async body => {
    const r = await fetch('/api/widget-eval', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const value = await r.json(); if (!r.ok) throw new Error(value.error); return value;
  }, body);
  const { sessionId } = uiOnly ? { sessionId: previous.sessionId } : await control({ op: 'create', title: id, provider: 'deepseek-official', model: 'deepseek-flash', cwd: join(root, 'workspace') });
  result.sessionId = sessionId;
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  if (!uiOnly) await control({ op: 'prompt', session: sessionId, id: id + '-initial', text: task.prompt });
  async function idle() {
    const end = Date.now() + 240000;
    while (Date.now() < end) {
      const state = await control({ op: 'inspect', session: sessionId });
      const calls = state.snapshot.events.filter(e => e.type === 'tool/call');
      if (calls.length > plan.maxToolCallsPerEpisode) throw new Error('Frozen tool call budget exceeded');
      if (calls.some(e => e.data.name === 'ask_user_question')) throw new Error('Requested a chat question instead of a visualization form');
      if (state.status === 'idle') return state;
      await page.waitForTimeout(500);
    }
    throw new Error('Episode generation timeout');
  }
  const initial = uiOnly ? JSON.parse(await readFile(join(output, 'initial.json'))) : await idle();
  delete initial.calls;
  if (!uiOnly) await writeFile(join(output, 'initial.json'), JSON.stringify(initial, null, 2));
  const toolCalls = initial.snapshot.events.filter(e => e.type === 'tool/call');
  result.tools = toolCalls.map(e => e.data.name);
  const cards = initial.snapshot.events.filter(e => e.type === 'tool/result' && e.data.meta?.kind === 'visualize');
  result.generated = cards.length > 0;
  if (!cards.length) {
    result.status = task.mustNotVisualize ? 'ready-for-oracle-review' : 'failed-no-visualization';
  } else {
    await page.getByText('交互评测', { exact: true }).first().click();
    await page.waitForTimeout(300);
    if (!(await page.getByText(id, { exact: true }).count())) {
      const box = await page.getByText('交互评测', { exact: true }).first().boundingBox();
      await page.mouse.click(box.x - 14, box.y + box.height / 2);
      await page.waitForTimeout(300);
    }
    for (let attempt = 0; attempt < 5 && !await page.getByText(id, { exact: true }).count(); attempt++) {
      const more = page.getByRole('button', { name: /展开其余 .* 个会话/ }).first();
      if (await more.count()) await more.click();
      await page.waitForTimeout(400);
    }
    await page.getByText(id, { exact: true }).first().click();
    await page.waitForTimeout(700);
    const expand = page.getByRole('button', { name: /在对话中|Show here|在此展开/ }).last();
    if (await expand.count()) await expand.click();
    const frames = page.locator('iframe:visible');
    if (!(await frames.count())) throw new Error('No live card visible');
    const handle = await page.locator('iframe:visible').last().elementHandle();
    await (await handle.contentFrame()).waitForLoadState('load', { timeout: 45000 });
    const frame = page.frameLocator('iframe:visible').last();
    const snapshot = await frame.locator('body').evaluate(body => ({
      text: body.innerText,
      controls: Array.from(body.querySelectorAll('input,select,textarea,button')).map((el, index) => ({
        index, tag: el.tagName, type: el.type, id: el.id, name: el.name, value: el.value,
        label: Array.from(el.labels ?? []).map(l => l.textContent).join(' '), text: el.textContent,
        min: el.min, max: el.max, step: el.step, ariaLabel: el.getAttribute('aria-label'),
        options: el.tagName === 'SELECT' ? Array.from(el.options).map(o => ({ value: o.value, text: o.text })) : undefined,
      })),
    }));
    await writeFile(join(output, 'controls.json'), JSON.stringify(snapshot, null, 2));
    await page.screenshot({ path: join(output, 'generated.png') });
    // The baseline workshop uses visible text beside unlabeled sliders; audited once.
    if (uiOnly && variant === 'baseline' && task.id === 'IC-E05') {
      for (const c of snapshot.controls) { if (c.id === 'ws-n') c.label = '人数'; if (c.id === 'ws-t') c.label = '时长'; }
      result.uiAssistance += '; ws-n=人数 and ws-t=时长 verified against generated DOM';
    }
    await performActions(page, frame, task, snapshot, result);
    if (result.submitted) await idle();
    result.status = 'ready-for-oracle-review';
    await page.screenshot({ path: join(output, 'after-actions.png') });
  }
} catch (error) { result.status = 'failed'; result.error = error.message.replace(/token=\S+/g, 'token=[REDACTED]'); }
finally {
  if (result.sessionId && control) {
    const final = await control({ op: 'inspect', session: result.sessionId }).catch(() => null);
    if (final?.status !== 'idle') await control({ op: 'cancel', session: result.sessionId }).catch(() => {});
    if (final) { delete final.calls; await writeFile(join(output, 'final.json'), JSON.stringify(final, null, 2)); }
  }
  result.finishedAt = new Date().toISOString();
  await writeFile(join(output, 'result.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ id, status: result.status, error: result.error, tools: result.tools }));
  await browser.close();
}
