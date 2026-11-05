// Packed plugin, real isolated Host, scripted model; never reads user profiles.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const pkg=resolve(new URL('..',import.meta.url).pathname);
const bin=process.env.DSH_BIN||'/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js';
const runtime=join(resolve(dirname(bin),'..'),'node_modules');
const tmp=mkdtempSync(join(tmpdir(),'peer-reply-browser-'));
const output=join(pkg,'test/evidence/reply-visibility',process.argv.includes('--baseline')?'browser-red':'browser');
mkdirSync(output,{recursive:true});
let host,browser,page,logs='';const errors=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();await new Promise((r,reject)=>{s.once('error',reject);s.listen(0,'127.0.0.1',r);});const port=s.address().port;await new Promise(r=>s.close(r));assert.notEqual(port,3091);return port;}
async function visibleText(text){return page.evaluate(t=>document.body.innerText.includes(t),text);}
try {
  const pack=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',tmp,'--cache',join(tmp,'cache')],{cwd:pkg,encoding:'utf8'}))[0];
  const installed=join(tmp,'installed');mkdirSync(installed);
  execFileSync('tar',['-xzf',join(tmp,pack.filename),'-C',installed]);
  const unpack=join(installed,'package');symlinkSync(runtime,join(unpack,'node_modules'),'dir');
  const home=join(tmp,'home'),profile=join(home,'profiles','reply-test');mkdirSync(join(profile,'node_modules','@lbryany'),{recursive:true});
  symlinkSync(unpack,join(profile,'node_modules','@lbryany','dsh-peer'),'dir');
  writeFileSync(join(profile,'package.json'),JSON.stringify({name:'reply-test',private:true,type:'module',dependencies:{'@lbryany/dsh-peer':pack.version},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@lbryany/dsh-peer']}}}));
  const fixture=join(profile,'node_modules','reply-fixture');mkdirSync(fixture);
  writeFileSync(join(fixture,'package.json'),JSON.stringify({name:'reply-fixture',type:'module',main:'index.js'}));
  symlinkSync(runtime,join(fixture,'node_modules'),'dir');
  writeFileSync(join(fixture,'index.js'),readFileSync(join(pkg,'test/reply-browser-fixture.mjs')));
  writeFileSync(join(profile,'cordis.patch.yml'),`- id: dsh-peer\n  config:\n    dir: ${JSON.stringify(join(tmp,'peers'))}\n    namesFile: ${JSON.stringify(join(tmp,'names.json'))}\n- id: hmr\n  disabled: true\n- insert:\n    - id: reply-fixture\n      name: reply-fixture\n      config:\n        ready: ${JSON.stringify(join(tmp,'ready.json'))}\n        cwd: ${JSON.stringify(tmp)}\n`);
  const port=await freePort();
  host=spawn(process.execPath,[bin,'--profile','reply-test','--port',String(port),'--no-open'],{cwd:tmp,env:{...process.env,DSH_HOME:home,DSH_PEER_DIR:join(tmp,'peers'),DSH_PEER_NAMES_FILE:join(tmp,'names.json'),DSH_TELEMETRY:'0'},stdio:['ignore','pipe','pipe']});
  host.stdout.on('data',d=>logs+=d);host.stderr.on('data',d=>logs+=d);
  let ready,url;
  for(let i=0;i<120;i++){
    try{ready=JSON.parse(readFileSync(join(tmp,'ready.json'),'utf8'));}catch{}
    url=logs.match(/http:\/\/127\.0\.0\.1:\d+[^\s\x1b]*/)?.[0];
    if(ready&&url)break;
    if(host.exitCode!==null)throw Error('Host exited '+host.exitCode);
    await sleep(200);
  }
  assert.ok(ready&&url,'isolated Host must initialize');
  writeFileSync(join(output,'host-events.json'),JSON.stringify(ready,null,2));
  assert.equal(ready.ok,true,ready.error);
  browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:join(tmp,'chrome'),args:['--no-sandbox','--lang=zh-CN'],env:{...process.env,LANG:'zh_CN.UTF-8'}});
  page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warn'].includes(m.type()))errors.push(m.text());});
  await page.setViewport({width:1100,height:900});await page.goto(url,{waitUntil:'networkidle2'});
  await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='继续')?.click());
  await page.waitForFunction(()=>document.body.innerText.includes('Peer 回复可见性验收'));
  await page.evaluate(()=>[...document.querySelectorAll('button,a,div,span,[role=button]')].find(e=>e.textContent.trim()==='Peer 回复可见性验收')?.click());
  await page.waitForSelector('[data-peer-message]');
  assert.ok(await visibleText(ready.normal),'ordinary assistant output remains visible');
  assert.ok(await visibleText('检查完成😀，修复位于边界判断。'),'SRV01: completed peer reply must be visible without expanding process');
  assert.equal(await page.$$eval('[data-peer-reply]',es=>es.length),1);
  assert.equal(await visibleText(ready.thought),false,'reasoning still follows native folding');
  await page.screenshot({path:join(output,'completed.png'),fullPage:true});
  await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('[data-peer-reply]');
  assert.equal(await page.$$eval('[data-peer-reply]',es=>es.length),1);
  assert.ok(await visibleText('第二项证据：回归已通过。'));
  await page.evaluate(()=>[...document.querySelectorAll('button')].filter(e=>e.textContent.includes('已完成，用时')).at(-1)?.click());
  await page.evaluate(()=>[...document.querySelectorAll('button')].filter(e=>e.textContent.includes('已调用工具')||e.textContent.includes('已完成分析')||e.textContent.includes('已思考')).forEach(e=>{if(e.getAttribute('aria-expanded')!=='true')e.click();}));
  await page.waitForFunction(t=>document.body.innerText.includes(t),{timeout:5000},ready.thought);
  await page.waitForSelector('[data-peer-exchange]');
  await page.$eval('[data-peer-exchange]',e=>e.open=true);
  assert.ok((await page.$eval('[data-peer-exchange]',e=>e.innerText)).includes('第二项证据：回归已通过。'));
  await page.screenshot({path:join(output,'process-expanded.png'),fullPage:true});
  await page.setViewport({width:360,height:900});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
  await page.waitForFunction(()=>[...document.querySelectorAll('[data-peer-reply]')].every(e=>e.scrollWidth<=e.clientWidth+2),{timeout:5000});
  await page.screenshot({path:join(output,'narrow-dark.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  writeFileSync(join(output,'result.json'),JSON.stringify({ok:true,version:pack.version,checks:['SRV01','SRV02'],modelCalls:ready.calls,replyCards:1,errors},null,2));
  console.log('SRV01/SRV02 passed: reply visible, native reasoning/tools preserved, one model response per trigger');
} catch(e) {
  writeFileSync(join(output,'failure.txt'),String(e.stack));
  if(page){writeFileSync(join(output,'page.txt'),await page.evaluate(()=>document.body.innerText).catch(()=>''));
    writeFileSync(join(output,'layout.json'),JSON.stringify(await page.evaluate(()=>[...document.querySelectorAll('[data-peer-reply], [data-peer-reply] *')].filter(e=>e.scrollWidth>e.clientWidth+2).map(e=>({tag:e.tagName,cls:e.className,client:e.clientWidth,scroll:e.scrollWidth,display:getComputedStyle(e).display,whiteSpace:getComputedStyle(e).whiteSpace,text:e.textContent.slice(0,100)}))).catch(()=>[]),null,2));
    await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});}
  throw e;
} finally {
  if(browser)await browser.close();
  if(host&&host.exitCode===null){host.kill('SIGTERM');await Promise.race([new Promise(r=>host.once('exit',r)),sleep(3000)]);if(host.exitCode===null){host.kill('SIGKILL');await new Promise(r=>host.once('exit',r));}}
  writeFileSync(join(output,'host.log'),logs.replace(/([?&]token=)[^\s&]+/g,'$1<redacted>'));
  writeFileSync(join(output,'cleanup.json'),JSON.stringify({hostExited:!host||host.exitCode!==null||host.signalCode!==null,browserClosed:!browser||!browser.connected}));
  rmSync(tmp,{recursive:true,force:true});
}
