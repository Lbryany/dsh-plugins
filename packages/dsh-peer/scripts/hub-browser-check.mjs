import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
import { createHubServer } from '../lib/hub/server.js';
const root = mkdtempSync(join(tmpdir(), 'hub-browser-'));
const output = resolve('test/evidence/hub-browser-' + Date.now()); mkdirSync(output);
const hub = createHubServer({ dir: join(root, 'centre'), port: 0 }); let browser;
try {
  await hub.start();
  const call = async (token, op, args) => (await fetch(hub.url + '/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-peer-generation': 'browser-fixture' }, body: JSON.stringify({ op, args }) })).json();
  const users = [];
  for (const name of ['alice', 'reviewer']) {
    const { credential } = await call(hub.adminToken, 'device.create', { name: name + '-machine' }); users.push(credential);
    await call(credential.token, 'connect', {}); await call(credential.token, 'sessions.sync', { sessions: [{ id: name, name, runtime: 'dsh', status: 'idle' }] });
  }
  await call(users[1].token, 'send', { from: 'reviewer', to: 'alice', text: '审查完成\n登录模块检查通过。\n<script>window.injected=true</script>', operationId: 'browser-message' });
  browser = await puppeteer.launch({ executablePath: process.env.CHROME_BIN || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true, userDataDir: join(root, 'chrome'), args: ['--no-first-run'] });
  const page = await browser.newPage(), errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.setViewport({ width: 1200, height: 900 }); await page.goto(hub.url);
  assert.equal(await page.$eval('#workspace', n => n.hidden), true);
  await page.type('#token', hub.adminToken); await page.click('#login button'); await page.waitForSelector('.member');
  assert.equal(await page.$$eval('.member', n => n.length), 2);
  const title = await page.$eval('.message summary', n => n.textContent); assert.match(title, /来自 @reviewer · 审查完成/);
  await page.focus('.message summary'); await page.keyboard.press('Enter');
  await page.waitForSelector('.message[open]');
  const body = await page.$eval('.message .body', n => n.textContent); assert.ok(body.includes('登录模块')); assert.ok(!body.includes('审查完成'));
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.screenshot({ path: join(output, 'desktop.png'), fullPage: true });
  await page.setViewport({ width: 360, height: 800 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: join(output, 'mobile.png'), fullPage: true });
  await page.click('#logout'); assert.equal(await page.$eval('#workspace', n => n.hidden), true);
  assert.deepEqual(errors, []);
  writeFileSync(join(output, 'result.json'), JSON.stringify({ ok: true, checks: ['authenticated-read', 'source-title', 'body-without-first-line', 'keyboard', 'escaped-body', '360px', 'logout'], errors }, null, 2));
  console.log(JSON.stringify({ ok: true, output }));
} catch (e) { writeFileSync(join(output, 'failure.txt'), e.stack); throw e; }
finally { await browser?.close(); await hub.stop(); rmSync(root, { recursive: true, force: true }); }
