// Continue the generated local animation until the first insertion completes.
// Fine-grained animation frames are allowed; no model retry or HTML edits.
import { readFile, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const pw = await import(process.env.VQ_PLAYWRIGHT_MODULE ?? '/Users/bryanlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs');
const root = process.argv[2];
const plan = JSON.parse(await readFile(root + '/plan.json'));
for (const run of [1, 2]) for (const variant of plan.evaluatedVariants ?? plan.variants) {
  const id = `${variant}-${run}-IC-N02`, dir = `${root}/episodes/${id}`;
  const login = (await readFile(`${root}/${variant === 'baseline' ? 'baseline-host.log' : 'host.log'}`, 'utf8')).match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)[0];
  const browser = await pw.chromium.launch({ headless: true, executablePath: process.env.VQ_CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' });
  try {
    const page = await browser.newPage(); await page.goto(login); await page.waitForTimeout(800);
    await page.getByText('交互评测', { exact: true }).first().click(); await page.waitForTimeout(300);
    if (!await page.getByText(id, { exact: true }).count()) {
      const box = await page.getByText('交互评测', { exact: true }).first().boundingBox();
      await page.mouse.click(box.x - 14, box.y + box.height / 2); await page.waitForTimeout(300);
    }
    if (!await page.getByText(id, { exact: true }).count() && await page.getByText(/展开其余 .* 个会话/).count()) await page.getByText(/展开其余 .* 个会话/).first().click();
    await page.getByText(id, { exact: true }).first().click(); await page.waitForTimeout(500);
    const expand = page.getByRole('button', { name: '在对话中展开', exact: true }).last();
    if (await expand.count()) await expand.click();
    const element = await page.locator('iframe:visible').last().elementHandle();
    await (await element.contentFrame()).waitForLoadState('load', { timeout: 45000 });
    const frame = page.frameLocator('iframe:visible').last();
    await frame.getByRole('button', { name: '重置', exact: true }).click();
    const steps = [];
    const numbers = async () => (await frame.locator('body').innerText()).split('\n').map(x => x.trim()).filter(x => /^[123]$/.test(x)).slice(0, 3).map(Number);
    assert.deepEqual(await numbers(), [3, 1, 2]);
    for (let n = 0; n < 12; n++) {
      await frame.getByRole('button', { name: '下一步', exact: true }).click();
      steps.push({ values: await numbers(), text: await frame.locator('body').innerText() });
      if (JSON.stringify(steps.at(-1).values) === '[1,3,2]') break;
    }
    assert.deepEqual(steps.at(-1).values, [1, 3, 2]);
    await frame.getByRole('button', { name: '重置', exact: true }).click();
    assert.deepEqual(await numbers(), [3, 1, 2]);
    assert.equal(await page.locator('[data-dsh-interaction-bar]:visible').count(), 0);
    await writeFile(`${dir}/local-oracle.json`, JSON.stringify({ status: 'passed', steps, reset: await numbers(), manualReview: 'advanced through animation substeps to first completed insertion; no generation retry' }, null, 2));
    console.log(id + ': first insertion and reset passed');
  } catch (error) {
    await writeFile(`${dir}/local-oracle.json`, JSON.stringify({ status: 'failed', error: error.message.replace(/token=\S+/g, 'token=[REDACTED]') }, null, 2));
    console.log(id + ': ' + error.message.slice(0, 100));
  } finally { await browser.close(); }
}
