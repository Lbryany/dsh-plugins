// Real isolated DSH Web Host + packed npm plugin. No credentials, model calls or real profiles.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, symlinkSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { execFileSync, spawn } from 'node:child_process';
import { createServer } from 'node:net';
import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';
const pkg=resolve(new URL('..',import.meta.url).pathname);
const baseline=process.argv.includes('--baseline'),noClient=process.argv.includes('--no-client'),history=process.argv.includes('--history');
const source=baseline ? process.env.PEER_BASELINE : pkg;
if (!source) throw Error('Set PEER_BASELINE for --baseline');
const bin=process.env.DSH_BIN || '/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js';
const dshRoot=resolve(dirname(bin),'..'), runtime=join(dshRoot,'node_modules');
const req=createRequire(join(dshRoot,'package.json'));
const tmp=mkdtempSync(join(tmpdir(),'peer-browser-')), output=join(pkg,'test/evidence',baseline?'browser-baseline':noClient?'browser-no-client':history?'browser-history':'browser');
mkdirSync(output,{recursive:true});
let host,browser,page,logs=''; const errors=[], diagnostics=[];
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
try {
 const pack=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',tmp,'--cache',join(tmp,'cache')],{cwd:source,encoding:'utf8'}))[0];
 const installed=join(tmp,'installed');mkdirSync(installed);
 execFileSync('tar',['-xzf',join(tmp,pack.filename),'-C',installed]);
 const unpack=join(installed,'package');
 if(baseline){
  const registry=join(unpack,'lib/registry.js'),original=readFileSync(registry,'utf8');
  const isolated=original.replace("export const defaultNamesFile = () => join(homedir(), '.dsh-peer', 'names.json');",'export const defaultNamesFile = () => '+JSON.stringify(join(tmp,'names.json'))+';');
  assert.notEqual(isolated,original,'Baseline names isolation adapter must apply');writeFileSync(registry,isolated);
 }
 if(noClient){const manifest=join(unpack,'package.json'),value=JSON.parse(readFileSync(manifest));delete value.dsh.client;writeFileSync(manifest,JSON.stringify(value));}
 symlinkSync(runtime,join(unpack,'node_modules'),'dir');
 const home=join(tmp,'home'),profile=join(home,'profiles','peer-test');mkdirSync(join(profile,'node_modules','@lbryany'),{recursive:true});
 symlinkSync(unpack,join(profile,'node_modules','@lbryany','dsh-peer'),'dir');
 writeFileSync(join(profile,'package.json'),JSON.stringify({name:'peer-test',private:true,type:'module',dependencies:{'@lbryany/dsh-peer':pack.version},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@lbryany/dsh-peer']}}}));
 const fixture=join(profile,'node_modules','peer-fixture');mkdirSync(fixture);writeFileSync(join(fixture,'package.json'),JSON.stringify({name:'peer-fixture',type:'module',main:'index.js'}));
 symlinkSync(runtime,join(fixture,'node_modules'),'dir');
 const fixtureSource=readFileSync(join(pkg,'test/browser-fixture.mjs'),'utf8');writeFileSync(join(fixture,'index.js'),fixtureSource);
 writeFileSync(join(profile,'cordis.patch.yml'),`- id: dsh-peer\n  config:\n    protection:\n      shortLimit: 6\n      longLimit: 6\n    dir: ${JSON.stringify(join(tmp,'peers'))}\n    namesFile: ${JSON.stringify(join(tmp,'names.json'))}\n- id: hmr\n  disabled: true\n- insert:\n    - id: peer-fixture\n      name: peer-fixture\n      config:\n        ready: ${JSON.stringify(join(tmp,'ready.json'))}\n        cwd: ${JSON.stringify(tmp)}\n        history: ${history}\n`);
 const port=await freePort();
 host=spawn(process.execPath,[bin,'--profile','peer-test','--port',String(port),'--no-open'],{cwd:tmp,env:{...process.env,DSH_HOME:home,DSH_PEER_DIR:join(tmp,'peers'),DSH_PEER_NAMES_FILE:join(tmp,'names.json'),DSH_TELEMETRY:'0'},stdio:['ignore','pipe','pipe']});
 host.stdout.on('data',d=>logs+=d);host.stderr.on('data',d=>logs+=d);
 let ready,url;
 for(let i=0;i<100;i++){
  try{ready=JSON.parse(readFileSync(join(tmp,'ready.json'),'utf8'));}catch{}
  url=logs.match(/http:\/\/127\.0\.0\.1:\d+[^\s\x1b]*/)?.[0];
  if(ready&&url)break;
  if(host.exitCode!==null)throw Error('Host exited '+host.exitCode);
  if(logs.includes('PEER_FIXTURE_ERROR'))throw Error('Fixture initialization failed; see host.log');
  await sleep(200);
 }
 if(!ready||!url)throw Error('Host did not become ready');
 if(!baseline){const denied=await fetch(new URL('/api/dsh-peer/status?session='+ready.session+'&from=session-aaaa-peer-fixture',url));assert.ok([401,403].includes(denied.status));}
 browser=await puppeteer.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,userDataDir:join(tmp,'chrome'),args:['--no-sandbox','--lang=zh-CN'],env:{...process.env,LANG:'zh_CN.UTF-8'}});
 page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(['error','warn'].includes(m.type())) diagnostics.push(m.text());});
 await page.setViewport({width:1100,height:850});
 await page.goto(url,{waitUntil:'networkidle2',timeout:30000});
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.trim()==='继续')?.click());
 await page.waitForFunction(()=>document.body.innerText.includes('Peer 验收'),{timeout:15000});
 await page.evaluate(()=>{const e=[...document.querySelectorAll('button,a,div,span,[role=button]')].find(e=>e.textContent.trim()==='Peer 验收');if(e)e.click();});
 await sleep(1000);
 await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('已完成，用时'))?.click());
 await sleep(500);
 if(baseline||noClient){
   assert.equal(await page.$('[data-peer-message]'),null);
   await page.waitForSelector('[data-turn-trigger] button');
   await page.$eval('[data-turn-trigger] button',e=>e.click());
   await page.waitForFunction(()=>document.body.innerText.includes('目标会话退出后'));
   assert.ok((await page.evaluate(()=>document.body.innerText)).includes('reviewer'));
   // The Host owns generic disclosure when the custom client is absent.
   writeFileSync(join(output,'generic-text.txt'),await page.evaluate(()=>document.body.innerText));
   await page.screenshot({path:join(output,'generic-before.png'),fullPage:true});
   writeFileSync(join(output,'result.json'),JSON.stringify({version:pack.version,peerCard:false,fullTextPreserved:true,errors,baselineNamesIsolation:baseline},null,2));
 }else{
   await page.waitForSelector('[data-peer-message]',{timeout:15000});
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent.includes('已调用工具'))?.click());
   await page.waitForSelector('[data-peer-send]',{timeout:5000});
   await page.waitForSelector('[data-peer-exchange]');
   assert.ok((await page.$eval('[data-peer-exchange]',e=>e.textContent)).includes('已交接'));
   const count=await page.$$eval('[data-peer-message]',es=>es.length);assert.ok(count>=3);
   assert.ok((await page.$eval('[data-peer-message]',e=>e.textContent)).includes('来自 @reviewer'));
   await page.screenshot({path:join(output,'collapsed.png'),fullPage:true});
   await page.$eval('details[data-peer-message] > summary',e=>e.click());
   assert.equal(await page.$eval('details[data-peer-message]',e=>e.open),true);
   await page.screenshot({path:join(output,'expanded.png'),fullPage:true});
   await page.$$eval('details[data-peer-message]',es=>es.forEach(e=>{e.open=true;}));
   await page.waitForSelector('.dsh-peer-body pre code');
   assert.ok((await page.$$eval('.dsh-peer-body',es=>es.map(e=>e.innerText).join('\n'))).includes('脚注正文'));
   await page.screenshot({path:join(output,'markdown.png'),fullPage:true});
   await page.$$eval('details[data-peer-message]',es=>es.forEach((e,i)=>{e.open=i===0;}));
   await page.$eval('details[data-peer-message] .dsh-peer-meta > summary',e=>e.click());
   await page.waitForFunction(()=>[...document.querySelectorAll('.dsh-peer-meta')].some(e=>e.textContent.includes('此方向已暂停')),{timeout:10000});
   await page.evaluate(()=>[...document.querySelectorAll('button')].find(e=>e.textContent==='恢复接收'&&!e.disabled)?.click());
   await page.waitForFunction(()=>document.body.innerText.includes('已恢复来自'),{timeout:10000});
   await page.screenshot({path:join(output,'restored.png'),fullPage:true});
   const overflow=async()=>page.evaluate(()=>[...document.querySelectorAll('[data-peer-message]')].some(e=>e.scrollWidth>e.clientWidth+2));
   assert.equal(await overflow(),false);
   await page.setViewport({width:360,height:850});await page.emulateMediaFeatures([{name:'prefers-color-scheme',value:'dark'}]);
   await sleep(250);assert.equal(await overflow(),false);
   await page.screenshot({path:join(output,'narrow-dark.png'),fullPage:true});
   await page.reload({waitUntil:'networkidle2'});await page.waitForSelector('[data-peer-message]');
   assert.equal(await page.$$eval('[data-peer-message]',es=>es.length),count);
   // Native details is keyboard-operable.
   await page.focus('details[data-peer-message] > summary');await page.keyboard.press('Enter');
   assert.equal(await page.$eval('details[data-peer-message]',e=>e.open),true);
   if(history){
    let pages=0;
    for(;pages<12;pages++){
     if(await page.evaluate(()=>[...document.querySelectorAll('[data-peer-message]')].some(e=>e.textContent.includes('archived-reviewer'))))break;
     const first=await page.$eval('[data-chat-node-key]',e=>e.getAttribute('data-chat-node-key'));
     const loaded=await page.evaluate(()=>{const button=[...document.querySelectorAll('button')].find(e=>e.textContent==='加载更早');if(!button)return false;button.click();return true;});assert.equal(loaded,true,'History fixture must require paging');
     await page.waitForFunction(old=>document.querySelector('[data-chat-node-key]')?.getAttribute('data-chat-node-key')!==old,{timeout:10000},first);
    }
    assert.ok(pages>0&&pages<12);
    await page.waitForFunction(()=>[...document.querySelectorAll('[data-peer-message]')].some(e=>e.textContent.includes('archived-reviewer')),{timeout:10000});
    assert.equal(await page.$$eval('[data-peer-message]',es=>es.length),count+1);
    assert.ok((await page.$$eval('[data-peer-message]',es=>es.map(e=>e.textContent).join('\n'))).includes('历史原文完整保留'));
   }
   const result={historyPaging:history,version:pack.version,integrity:pack.integrity,checks:['source/title/body','send-result','owner-query','unauthenticated-query-denied','resume','markdown/code/footnotes','narrow/dark','reload','keyboard','no-console-errors'],runtime:JSON.parse(readFileSync(join(dshRoot,'package.json'))).version,count,errors,packedFiles:pack.files.map(f=>f.path)};
   assert.equal(errors.length,0,errors.join('\n'));assert.equal(diagnostics.length,0,diagnostics.join('\n'));
   writeFileSync(join(output,'result.json'),JSON.stringify(result,null,2));
 }
 console.log(baseline||noClient?'Generic Host fallback, no peer card':'Packed peer browser checks passed');
}catch(e){if(page){await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});writeFileSync(join(output,'page.txt'),await page.evaluate(()=>document.body.innerText).catch(()=>''));}writeFileSync(join(output,'failure.txt'),String(e.stack));writeFileSync(join(output,'client-errors.json'),JSON.stringify({errors,diagnostics,styles:await page?.evaluate(()=>!!document.querySelector('style[data-plugin="@lbryany/dsh-peer"]')),scripts:await page?.evaluate(()=>[...document.scripts].map(s=>s.src))},null,2));throw e;}
finally{
 if(browser)await browser.close();
 if(host&&host.exitCode===null){host.kill('SIGTERM');await Promise.race([new Promise(r=>host.once('exit',r)),sleep(5000)]);if(host.exitCode===null)host.kill('SIGKILL');}
 writeFileSync(join(output,'host.log'),logs.replace(/([?&]token=)[^\s&]+/g,'$1<redacted>'));
 rmSync(tmp,{recursive:true,force:true});
}
