import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { apply } from '../index.js';
import { validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
test('G09/UI03 root identity, commands only, no recovery wakeup, output meta', async t => {
  const dir=mkdtempSync(join(tmpdir(),'peer-host-')), tools=new Map(), commands=new Map(), got=[];
  const root={id:'session-aaaa-root',session:{header:{id:'session-aaaa-root',cwd:'/tmp/a'},deriveMessages:()=>[{role:'user'}]}};
  const target={id:'session-bbbb-target',session:{header:{id:'session-bbbb-target',cwd:'/tmp/b'},deriveMessages:()=>[{role:'user'}]},followup:m=>got.push(m),steer:m=>got.push(m)};
  const child={id:'child',session:{header:{origin:'subagent',parentSession:root.id},deriveMessages:()=>[]}};
  const agents=[root,target,child]; const disposers=[];
  const ctx={agents:{list:()=>agents,get:id=>agents.find(a=>a.id===id)},tools:{register:t=>tools.set(t.name,t)},on(){},
    effect(fn,label){if(label==='dsh-peer.registry') return; const dispose=fn();if(dispose)disposers.push(dispose);},
    inject(keys,fn){if(keys[0]==='commands')fn({...ctx,commands:{register:c=>{commands.set(c.name,c);return()=>{};}}});}};
  t.after(()=>{disposers.forEach(d=>d());rmSync(dir,{recursive:true,force:true});});
  apply(ctx,{dir:join(dir,'run'),namesFile:join(dir,'names.json'),protection:{shortLimit:1,longLimit:1}});
  assert.deepEqual([...tools.keys()],['peer_list','peer_send','peer_rename','peer_request','peer_reply','peer_wait']);
  const send=tools.get('peer_send');
  const first=await send.execute({to:'bbbb',text:'result'},{agent:child});
  validateJsonSchemaValue(send.output.schema,first);
  assert.equal(first.ok,true);assert.equal(got[0].source.peer.session,root.id);
  assert.deepEqual(send.output.presentationMeta({},first),{peer:first.display});
  assert.equal(send.output.render({},first)[0].text,first.text);
  const second=await send.execute({to:'bbbb',text:'another'},{agent:root});assert.equal(second.ok,false);validateJsonSchemaValue(send.output.schema,second);
  assert.equal(second.display.reason,'conversation-paused');
  assert.equal(commands.has('peer-status'),false);
  assert.match(commands.get('peers').handler({agent:target}).text,/已暂停/);
  assert.equal(commands.get('peer-resume').handler({agent:target,rawInput:'aaaa'}).kind,'success');
  assert.equal(commands.get('peer-resume').handler({agent:target,rawInput:'aaaa'}).kind,'success');
  assert.equal(got.length,1);
  assert.equal((await send.execute({to:'bbbb',text:'new task'},{agent:root})).ok,true);
  assert.match(send.description,/纯确认、感谢、告别不发送/);
});
test('UI03 read-only owner route validates live receiver and never executes command',async()=>{
 const { protectionResponse }=await import('../lib/status-route.js');
 const core={has:id=>id==='b',protectionStatus:()=>[{from:'a',paused:true,count:12}]};
 const agents={get:id=>id==='b'?{}:undefined};
 const req=url=>new Request('http://localhost/api/dsh-peer/status'+url);
 const r=await protectionResponse(core,agents,req('?session=b&from=a'));assert.deepEqual(await r.json(),{paused:true,count:12});
 assert.equal((await protectionResponse(core,agents,req('?session=missing&from=a'))).status,404);
 assert.equal((await protectionResponse(core,agents,req(''))).status,400);
});
test('B14 peer_list defaults to compact discovery; details retains full routing context',async t=>{
 const dir=mkdtempSync(join(tmpdir(),'peer-list-')),definitions=new Map();t.after(()=>rmSync(dir,{recursive:true,force:true}));
 const a={id:'session-aaaa-list',status:'idle',session:{header:{id:'session-aaaa-list',cwd:'/tmp/discovery-workspace'},deriveMessages:()=>[{role:'user'}]}};
 const ctx={agents:{list:()=>[a],get:()=>a},tools:{register:tool=>definitions.set(tool.name,tool)},on(){},inject(){},effect(){}};
 apply(ctx,{dir:join(dir,'run'),namesFile:join(dir,'names.json')});
 const tool=definitions.get('peer_list');
 const compact=await tool.execute({},{agent:a});assert.match(compact.text,/discovery-workspace-aaaa/);assert.match(compact.text,/idle/);assert.doesNotMatch(compact.text,/\/tmp\/discovery-workspace/);
 const detailed=await tool.execute({details:true},{agent:a});assert.match(detailed.text,/\/tmp\/discovery-workspace/);assert.match(detailed.text,/profile/);
});
