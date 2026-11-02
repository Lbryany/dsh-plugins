// Browser checks of the frozen numeric and state transitions; no generated code is patched.
import { readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { join, resolve } from 'node:path';
import { buildFrameDoc } from '../src/shell.ts';

const { chromium } = await import(process.env.VQ_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.VQ_PLAYWRIGHT_MODULE).href : 'playwright');
if (!process.argv[2]) throw new Error('Pass a generated-results directory.');
const root = resolve(process.argv[2]);
const results = JSON.parse(await readFile(join(root, 'results.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, ...(process.env.VQ_CHROME ? { executablePath: process.env.VQ_CHROME } : {}) });
const reports = [];
try {
  for (const record of results.results.filter(r => r.status === 'generated')) {
    const value = JSON.parse(await readFile(join(root, `${record.id}.json`), 'utf8'));
    const page = await browser.newPage({ viewport: { width: value.mode === 'page' ? 1280 : 640, height: 900 } });
    const errors = [], observations = [];
    page.on('pageerror', e => errors.push(e.message));
    const doc = buildFrameDoc({ ...value, themeVars: {}, colorScheme: 'light', reportToken: 'interaction', variant: value.mode === 'page' ? 'page' : 'card' });
    const check = (condition, message) => { if (!condition) errors.push(message); };
    const observe = async label => { await page.waitForTimeout(350); const text = await page.locator('body').innerText(); observations.push({ label, text }); return text; };
    const range = async v => page.locator('input[type="range"]').evaluate((el, next) => { el.value = next; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, v);
    try {
      await page.setContent(doc, { waitUntil: 'load' });
      await page.waitForTimeout(1000);
      const initial = await observe('initial');
      if (record.id.startsWith('parameter-simulator')) {
        check(initial.includes('55.8'), 'initial temperature must be 55.8');
        await range('0.20'); check((await observe('k=0.20')).includes('38.8'), 'temperature must change to 38.8');
      } else if (record.id.startsWith('option-comparison')) {
        check(initial.includes('120') && initial.includes('150'), 'initial prices');
        await range('30'); const text = await observe('hours=30');
        check(text.includes('360') && text.includes('250') && text.includes('110'), 'updated prices and saving');
      } else if (record.id.startsWith('step-explainer')) {
        check(await page.getByRole('button', { name: '上一步', exact: true }).isDisabled(), 'back disabled initially');
        await page.getByRole('button', { name: '下一步', exact: true }).click(); await observe('step2');
        await page.getByRole('button', { name: '下一步', exact: true }).click();
        await page.getByRole('button', { name: '下一步', exact: true }).click(); await observe('step4');
        check(await page.getByRole('button', { name: '下一步', exact: true }).isDisabled(), 'next disabled at end');
        await page.getByRole('button', { name: '重置', exact: true }).click(); await observe('reset');
        check(await page.getByRole('button', { name: '上一步', exact: true }).isDisabled(), 'back disabled after reset');
      } else if (record.id.startsWith('analysis-dashboard')) {
        check(initial.includes('350'), 'initial total');
        await page.locator('select').selectOption({ label: '华东' }); const text = await observe('east');
        check(text.includes('240') && text.includes('100') && text.includes('140') && /40(?:\.0)?\s*%/.test(text), 'east values and growth');
        check(await page.locator('tbody tr').count() === 2, 'east has two rows');
      } else if (record.id.startsWith('exploration-tool')) {
        await page.locator('select').selectOption({ label: '存储' }); await observe('storage');
        check(await page.locator('tbody tr').count() === 2, 'storage has two rows');
        await page.locator('input[type="search"]').fill('归档'); const text = await observe('storage+archive');
        check(await page.locator('tbody tr').count() === 1 && text.includes('30'), 'archive row');
        await page.locator('input[type="search"]').fill('不存在的名称'); const empty = await observe('empty');
        check(/没有|无匹配|未找到|暂无/.test(empty), 'explicit empty state');
        check(await page.locator('tbody tr').count() <= 1, 'no data rows in empty state');
      } else if (record.id.startsWith('explanation-page')) {
        check(initial.includes('400'), 'initial orders');
        await range('20'); const text = await observe('rate=20');
        check(text.includes('800') && /3,?200/.test(text), '800 orders and 3200 unconverted');
        await range('0'); await observe('rate=0');
      }
    } catch { errors.push('browser-action-failed'); }
    reports.push({ id: record.id, pass: errors.length === 0, errors, observations });
    console.log(record.id, errors.length === 0 ? 'pass' : errors.join('; '));
    await page.close();
  }
} finally { await browser.close(); }
await writeFile(join(root, 'interactions.json'), JSON.stringify(reports, null, 2));
if (reports.some(r => !r.pass)) process.exitCode = 1;
