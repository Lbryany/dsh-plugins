// Node 22+; VQ_PLAYWRIGHT_MODULE can name an externally installed Playwright.
// node eval/check-browser.mjs /absolute/output [generated-results-directory]
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { buildFrameDoc } from '../src/shell.ts';
import { PAGE_CSS } from '../src/frame-css.ts';
import { lintFragment } from '../src/lint.ts';

const { chromium } = await import(process.env.VQ_PLAYWRIGHT_MODULE ? pathToFileURL(process.env.VQ_PLAYWRIGHT_MODULE).href : 'playwright');

const plan = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
if (!process.argv[2]) throw new Error('Pass a screenshot output directory.');
const output = resolve(process.argv[2]);
await mkdir(output, { recursive: true });
const items = [];
if (process.argv[3]) {
  const run = resolve(process.argv[3]);
  const result = JSON.parse(await readFile(join(run, 'results.json'), 'utf8'));
  for (const record of result.results.filter(r => r.status === 'generated')) {
    const value = JSON.parse(await readFile(join(run, `${record.id}.json`), 'utf8'));
    items.push({ id: record.id, ...value, group: record.id.endsWith('-baseline') ? 'baseline' : 'candidate' });
  }
} else {
  for (const task of plan.cases) items.push({ id: task.id, mode: task.mode, title: task.id, fragment: await readFile(new URL(`../assets/examples/${task.id}.html`, import.meta.url), 'utf8') });
}
const oldCSS = execFileSync('git', ['show', `${plan.baseline}:packages/dsh-widget/src/frame-css.ts`], { cwd: new URL('../', import.meta.url), encoding: 'utf8' }).split('export const PAGE_CSS = `')[1].split('`')[0];
const pages = new Map();
for (const item of items) for (const colorScheme of ['light', 'dark']) {
  let doc = buildFrameDoc({ fragment: item.fragment, title: item.title, themeVars: {}, colorScheme, reportToken: 'visual-review', variant: item.mode === 'page' ? 'page' : 'card' });
  if (item.group === 'baseline') doc = doc.replace(PAGE_CSS, oldCSS);
  pages.set(`/${item.id}-${colorScheme}`, doc);
}
const server = createServer((req, res) => { const doc = pages.get(req.url); res.writeHead(doc ? 200 : 404, { 'content-type': 'text/html; charset=utf-8' }); res.end(doc ?? 'Not found'); });
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const browser = await chromium.launch({ headless: true, ...(process.env.VQ_CHROME ? { executablePath: process.env.VQ_CHROME } : {}) });
const reports = [];
try {
  for (const item of items) {
    const lint = lintFragment(item.fragment, 1_000_000).findings;
    for (const theme of ['light', 'dark']) for (const width of [item.mode === 'page' ? 1280 : 640, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 900 }, colorScheme: theme, reducedMotion: 'reduce' });
      const errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.goto(`http://127.0.0.1:${port}/${item.id}-${theme}`);
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const metrics = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight }));
      const file = `${item.id}-${theme}-${width}.png`;
      await page.screenshot({ path: join(output, file), fullPage: true });
      const report = { id: item.id, theme, width, file, ...metrics, overflow: metrics.scrollWidth > width + 1, errors, lintErrors: lint.filter(x => x.severity === 'error'), lintWarnings: lint.filter(x => x.severity === 'warn') };
      reports.push(report);
      console.log(`${file}: overflow=${report.overflow}, scriptErrors=${errors.length}, lintErrors=${report.lintErrors.length}`);
      await page.close();
    }
  }
} finally { await browser.close(); await new Promise(r => server.close(r)); }
await writeFile(join(output, 'report.json'), JSON.stringify({ port, reports }, null, 2));
if (reports.some(r => r.overflow || r.errors.length || r.lintErrors.length)) process.exitCode = 1;
