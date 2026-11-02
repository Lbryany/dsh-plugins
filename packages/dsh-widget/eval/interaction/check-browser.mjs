import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '/Users/bryanlee/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=process.argv[2]; if (!root) throw new Error('Pass isolated evidence root');
const log=await readFile(root+'/host.log','utf8');
const url=log.match(/http:\/\/127\.0\.0\.1:\d+\/\?token=\S+/)[0];
const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
const page=await browser.newPage(); page.on('pageerror',e=>console.log('PAGEERROR',e.message)); await page.addInitScript(()=>{window.__captureTrace=[];window.addEventListener('message',e=>{if(e.data?.type?.includes('captur') || e.data?.method==='interaction.register')window.__captureTrace.push({type:e.data.type,method:e.data.method,epoch:e.data.epoch,params:e.data.params,captureId:e.data.captureId});});});await page.goto(url);await page.waitForTimeout(1200);
if(await page.getByRole('button',{name:'继续',exact:true}).count())await page.getByRole('button',{name:'继续',exact:true}).click();
const control=body=>page.evaluate(async body=>{const r=await fetch('/api/widget-eval',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});return r.json();},body);
const title='交互验收-'+Date.now();
const {sessionId}=await control({op:'create',title});
await control({op:'prompt',session:sessionId,id:'fixture-ui',text:'__FIXTURE_CARD__'});
await page.waitForTimeout(1800);
await page.getByText('交互评测',{exact:true}).first().click(); await page.waitForTimeout(500);
const wb=await page.getByText('交互评测',{exact:true}).first().boundingBox(); await page.mouse.click(wb.x-14,wb.y+wb.height/2); await page.waitForTimeout(500); const titleMatch=page.getByText(title,{exact:true});

if(await titleMatch.count()) await titleMatch.first().click();
await page.waitForTimeout(1500);


const beforeActions=(await control({op:'calls'})).length;
const frame=page.frameLocator('iframe:visible').last();
await frame.locator('select[name=plan]').selectOption('B');
const slider=frame.locator('input[name=hours]');await slider.focus();await slider.press('Home');for(let i=0;i<30;i++)await slider.press('ArrowRight');
await page.waitForTimeout(1500); if ((await control({op:'calls'})).length !== beforeActions) throw new Error('Local changes triggered model inference'); await page.locator('[data-dsh-interaction-bar]:visible').last().getByRole('button',{name:'分析我的选择',exact:true}).click();
const dialog=page.getByRole('dialog',{name:'确认本次选择'});
await page.waitForTimeout(800); try{await dialog.waitFor({timeout:6500});}catch(e){console.log('ALLBARS',await page.locator('[data-dsh-interaction-bar]').allTextContents());console.log('TRACE',JSON.stringify(await Promise.all(page.frames().map(f=>f.evaluate(()=>({count:window.__captureTrace?.length,trace:window.__captureTrace?.slice(-8),fields:Array.from(document.querySelectorAll('input,select')).map(x=>({name:x.name,value:x.value}))})).catch(()=>null)))));await page.screenshot({path:root+'/capture-failed.png',fullPage:true});throw e;}
if(!(await dialog.innerText()).includes('30'))throw new Error('Preview lacks current value');
await slider.press('ArrowRight');
await dialog.getByRole('button',{name:'确认并继续'}).click();
await page.waitForTimeout(1500);
const result=await control({op:'inspect',session:sessionId});
const text=result.calls.at(-1).messages.flatMap(m=>m.content||[]).filter(b=>b.type==='text').map(b=>b.text).join('\n');
const contexts=[...text.matchAll(/<untrusted_widget_state>\s*([\s\S]*?)\s*<\/untrusted_widget_state>/g)];
const state=JSON.parse(contexts.at(-1)[1]).find(x=>x.state.hours!==undefined).state;
if(state.hours!==30||state.plan!=='B')throw new Error('Model-visible snapshot drifted: '+JSON.stringify(state));
console.log('PASS: local changes cause no inference; captured B/30, edited to31 after preview, model received B/30');
await writeFile(root+'/browser-check.json',JSON.stringify({status:'passed',sessionId,localChangesWithoutInference:32,captured:{plan:'B',hours:30},laterHours:31,modelVisible:state},null,2));
await page.screenshot({path:root+'/card-page.png',fullPage:true});
await writeFile(root+'/card-inspect.json',JSON.stringify(await control({op:'inspect',session:sessionId}),null,2));
}finally{await browser.close();}
