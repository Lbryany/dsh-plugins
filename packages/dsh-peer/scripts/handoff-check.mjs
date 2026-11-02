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
const source=pkg, baseline=false, noClient=false;
const bin=process.env.DSH_BIN||'/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js';
const runtime=join(resolve(dirname(bin),'..'),'node_modules');
const tmp=mkdtempSync(join(tmpdir(),'peer-handoff-')),output=join(pkg,'test/evidence/handoff-host.json');
let host,logs='';const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function freePort(){const s=createServer();await new Promise(r=>s.listen(0,'127.0.0.1',r));const p=s.address().port;await new Promise(r=>s.close(r));return p;}
try {
 const pack=JSON.parse(execFileSync('npm',['pack','--json','--pack-destination',tmp,'--cache',join(tmp,'cache')],{cwd:source,encoding:'utf8'}))[0];
 const installed=join(tmp,'installed');mkdirSync(installed);
 execFileSync('tar',['-xzf',join(tmp,pack.filename),'-C',installed]);
 const unpack=join(installed,'package');
 if(false){
  const registry=join(unpack,'lib/registry.js'),original=readFileSync(registry,'utf8');
  const isolated=original.replace("export const defaultNamesFile = () => join(homedir(), '.dsh-peer', 'names.json');",'export const defaultNamesFile = () => '+JSON.stringify(join(tmp,'names.json'))+';');
  assert.notEqual(isolated,original,'Baseline names isolation adapter must apply');writeFileSync(registry,isolated);
 }
 if(false){const manifest=join(unpack,'package.json'),value=JSON.parse(readFileSync(manifest));delete value.dsh.client;writeFileSync(manifest,JSON.stringify(value));}
 symlinkSync(runtime,join(unpack,'node_modules'),'dir');
 const home=join(tmp,'home'),profile=join(home,'profiles','peer-handoff');mkdirSync(join(profile,'node_modules','@lbryany'),{recursive:true});
 symlinkSync(unpack,join(profile,'node_modules','@lbryany','dsh-peer'),'dir');
 writeFileSync(join(profile,'package.json'),JSON.stringify({name:'peer-handoff',private:true,type:'module',dependencies:{'@lbryany/dsh-peer':pack.version},dsh:{profile:{bundles:['@deepseek-ai/dsh-base','@deepseek-ai/dsh-web-app','@lbryany/dsh-peer']}}}));
 const fixture=join(profile,'node_modules','peer-fixture');mkdirSync(fixture);writeFileSync(join(fixture,'package.json'),JSON.stringify({name:'peer-fixture',type:'module',main:'index.js'}));
 symlinkSync(runtime,join(fixture,'node_modules'),'dir');
 const fixtureSource=readFileSync(join(pkg,'test/handoff-fixture.mjs'),'utf8');writeFileSync(join(fixture,'index.js'),fixtureSource);
 writeFileSync(join(profile,'cordis.patch.yml'),`- id: dsh-peer\n  config:\n    protection:\n      shortLimit: 12\n      longLimit: 12\n    dir: ${JSON.stringify(join(tmp,'peers'))}\n    namesFile: ${JSON.stringify(join(tmp,'names.json'))}\n- id: hmr\n  disabled: true\n- insert:\n    - id: peer-fixture\n      name: peer-fixture\n      config:\n        ready: ${JSON.stringify(join(tmp,'ready.json'))}\n        cwd: ${JSON.stringify(tmp)}\n        history: false\n`);
 const port=await freePort();
 host=spawn(process.execPath,[bin,'--profile','peer-handoff','--port',String(port),'--no-open'],{cwd:tmp,env:{...process.env,DSH_HOME:home,DSH_PEER_DIR:join(tmp,'peers'),DSH_PEER_NAMES_FILE:join(tmp,'names.json'),DSH_TELEMETRY:'0'},stdio:['ignore','pipe','pipe']});
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
 writeFileSync(output,JSON.stringify(ready,null,2));assert.equal(ready.ok,true,ready.error);
 const {PEER_POLICY}=await import('../lib/policy.js');
 assert.ok(ready.snapshots[0].messages.some(m=>m.role==='system'&&(typeof m.content==='string'?m.content:m.content.filter(b=>b.type==='text').map(b=>b.text).join('\n')).includes(PEER_POLICY)),'exact registered policy must reach the real Host request');
 console.log(JSON.stringify({ok:ready.ok,counts:ready.counts,marker:ready.marker}));
} finally {if(host&&host.exitCode===null){host.kill('SIGTERM');await Promise.race([new Promise(r=>host.once('exit',r)),sleep(3000)]);if(host.exitCode===null)host.kill('SIGKILL');}writeFileSync(output+'.log',logs.replace(/token=[^\s&]+/g,'token=REDACTED'));rmSync(tmp,{recursive:true,force:true});}
