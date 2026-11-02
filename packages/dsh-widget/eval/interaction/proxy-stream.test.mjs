import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:https';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

test('immediate next request after message_stop waits for persisted usage and released admission', async () => {
  const root = await mkdtemp(join(tmpdir(), 'widget-proxy-test-'));
  let child, server;
  try {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', root+'/key.pem', '-out', root+'/cert.pem', '-days', '1', '-subj', '/CN=127.0.0.1', '-addext', 'subjectAltName=IP:127.0.0.1'], { stdio: 'ignore' });
    const response = 'data: '+JSON.stringify({type:'message_start',message:{usage:{input_tokens:1000,output_tokens:0}}})+'\n\n'
      +'data: '+JSON.stringify({type:'message_delta',usage:{output_tokens:1}})+'\n\n'
      +'data: '+JSON.stringify({type:'message_stop'})+'\n\n';
    server = createServer({ key: await readFile(root+'/key.pem'), cert: await readFile(root+'/cert.pem') }, async (req,res) => {
      for await (const _ of req) {}
      res.writeHead(200, {'content-type':'text/event-stream'}); res.write(response);
      // The API completion event can arrive before the HTTP stream closes.
      await delay(100); res.end();
    });
    await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
    await writeFile(root+'/provider.json',JSON.stringify({model:'deepseek-flash',apiKey:'test-only',baseURL:'https://127.0.0.1:'+server.address().port}));
    const plan = JSON.parse(await readFile(new URL('./cases-v2.json',import.meta.url)));
    await writeFile(root+'/plan.json',JSON.stringify(plan));
    child=spawn(process.execPath,[new URL('./provider-proxy.mjs',import.meta.url).pathname,root+'/provider.json',root+'/out',root+'/plan.json'],{env:{...process.env,NODE_EXTRA_CA_CERTS:root+'/cert.pem'},stdio:'pipe'});
    let endpoint;
    for(let n=0;n<100;n++){try{endpoint=JSON.parse(await readFile(root+'/out/endpoint.json')).url;break;}catch{await delay(50);}}
    assert.ok(endpoint,'proxy startup');
    await fetch(endpoint+'/episode',{method:'POST',body:JSON.stringify({id:'candidate-1-IC-E01'})});
    async function call(){
      const r=await fetch(endpoint+'/messages',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({model:'deepseek-flash',messages:[{role:'user',content:'test'}],stream:true})});
      assert.equal(r.status,200,await (r.status===200?Promise.resolve(''):r.text()));
      let text='';for await(const part of r.body){text+=new TextDecoder().decode(part);if(text.includes('message_stop'))return;}
      assert.fail('Missing completion');
    }
    for(let n=0;n<3;n++)await call();
    const usage=JSON.parse(await readFile(root+'/out/usage.json'));
    assert.equal(usage.requests,3);assert.equal(usage.totalTokens,3003);assert.equal(usage.stopped,null);
    child.kill(); await new Promise(resolve=>child.once('exit',resolve));
    child=spawn(process.execPath,[new URL('./provider-proxy.mjs',import.meta.url).pathname,root+'/provider.json',root+'/out',root+'/plan.json','--resume'],{env:{...process.env,NODE_EXTRA_CA_CERTS:root+'/cert.pem',WIDGET_EVAL_ADDITIONAL_REQUESTS:'1'},stdio:'pipe'});
    for(let n=0;n<100;n++){try{await fetch(endpoint+'/models');break;}catch{await delay(50);}}
    await fetch(endpoint+'/episode',{method:'POST',body:JSON.stringify({id:'candidate-1-IC-E01'})});
    await call();
    const resumed=JSON.parse(await readFile(root+'/out/usage.json'));
    assert.equal(resumed.requests,4);assert.equal(resumed.totalTokens,4004);
    assert.equal(resumed.records.at(-1).request,4);
    const rejected=await fetch(endpoint+'/messages',{method:'POST',body:JSON.stringify({model:'deepseek-flash',messages:[{role:'user',content:'test'}]})});
    assert.equal(rejected.status,503);
    assert.equal(JSON.parse(await readFile(root+'/out/usage.json')).requests,4);
  } finally {
    if(child){child.kill();await new Promise(resolve=>child.once('exit',resolve));}
    if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await rm(root,{recursive:true,force:true});
  }
});
