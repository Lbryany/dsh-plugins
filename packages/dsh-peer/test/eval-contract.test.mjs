import {test} from 'node:test';
import assert from 'node:assert/strict';
import {grade,reserveSend,toolDescription} from '../eval/contract.mjs';
import {readFileSync} from 'node:fs';
const spec=JSON.parse(readFileSync(new URL('../eval/loop-control-cases.json',import.meta.url)));
const send=(agent,to,text)=>({agent,args:{to,text},result:{ok:true}});
const final=content=>({agent:'a',message:{content}});
test('E protocol grading rejects keyword-only reports and incomplete cooperation',()=>{
 for(const c of spec.cases.filter(x=>!x.quiet)) assert.equal(grade(c,[final(c.expected.join(' '))],'natural',0).pass,false);
 const c=spec.cases.find(x=>x.id==='E05'),t=[send('a','b','review'),send('b','a','空值 超时 重复'),final('空值 超时 重复')];
 assert.equal(grade(c,t,'natural',2).pass,false);
 t.splice(2,0,send('a','b','修复 空值 超时 重复'),send('b','a','复核通过'));
 assert.equal(grade(c,t,'natural',4).pass,true);
 assert.equal(grade(c,t,'send-cap',24).pass,false);
});
test('E budget is enforced for each tool call in a multi-call response',()=>{
 const state={attempts:23};assert.equal(reserveSend(state,24),true);assert.equal(reserveSend(state,24),false);assert.equal(state.attempts,24);
});
test('E uses the package tool instructions without variant-specific system overrides',()=>{
 assert.match(toolDescription(new URL('..',import.meta.url).pathname),/纯确认、感谢、告别不发送/);
});
test('E extra-send metric counts delivery edges, not result wrappers or read-only calls',()=>{
 const c=spec.cases.find(x=>x.id==='E04');
 const t=[{...send('a','b','task'),edge:true},{...send('b','a','单价?'),edge:true},{...send('a','b','3'),edge:true},{...send('b','a','30'),edge:true},
  {agent:'b',call:{function:{name:'peer_reply'}},result:{ok:true}}, {agent:'a',call:{function:{name:'peer_wait'}},result:{ok:true}},final('30')];
 assert.equal(grade(c,t,'natural',4).extraSendsAfterResult,0);
 t.push({...send('a','b','thanks'),edge:true});assert.equal(grade(c,t,'natural',5).extraSendsAfterResult,1);
});
