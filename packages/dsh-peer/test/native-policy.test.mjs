import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {apply} from '../index.js';
import {PEER_POLICY} from '../lib/policy.js';
import {captureHostPrompt} from '../eval/host-prompt.mjs';
test('B15 actual native section augments the persona and can be disabled/disposed',t=>{
 const root=mkdtempSync(join(tmpdir(),'peer-policy-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 for(const enabled of [true,false]){
  const prompt=captureHostPrompt(),dispose=[];
  const ctx={agents:{list:()=>[]},tools:{register(){}},on(){},effect(fn,label){if(label==='dsh-peer.policy')dispose.push(fn());},
   inject(keys,fn){if(keys[0]==='systemPrompt')fn({...ctx,systemPrompt:prompt.service});}};
  apply(ctx,{dir:join(root,'run'),namesFile:join(root,'names.json'),promptPolicy:enabled});
  const text=prompt.render('original task',{});
  assert.equal(text,enabled?'original task\n\n'+PEER_POLICY:'original task');
  assert.equal(prompt.entries().some(s=>s.complete),false);
  for(const fn of dispose)fn();assert.equal(prompt.render('original task',{}),'original task');
 }
});
