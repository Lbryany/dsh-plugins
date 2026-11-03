import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
// Read the shipped literal, not a second hand-written version of the prompt.
export function toolDescription(root) {
 const source=readFileSync(join(root,'index.js'),'utf8');
 const tail=source.match(/const TAIL = '([^']*)';/)?.[1];
 const description=source.match(/name: 'peer_send',\s*description: `([^`]*)`/)?.[1]?.replace(/\$\{config\.hub \? '[^']*' : TAIL\}/g,'${TAIL}');
 if(!tail||!description||description.replace('${TAIL}','').includes('${'))throw Error('Unsupported tool description format');
 return description.replace('${TAIL}',tail);
}
export function fingerprint(root){
 const modules=dir=>readdirSync(join(root,dir),{withFileTypes:true}).flatMap(e=>e.isDirectory()?modules(dir+'/'+e.name):e.name.endsWith('.js')?[dir+'/'+e.name]:[]);
 const files=['package.json','index.js',...modules('lib')].sort();
 return {version:JSON.parse(readFileSync(join(root,'package.json'))).version,files:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(join(root,f))).digest('hex')]))};
}
export function reserveSend(state,limit){if(state.attempts>=limit)return false;state.attempts++;return true;}
export function grade(c,transcript,reason,attempts){
 const rejected=transcript.filter(x=>x.result&&!x.result.ok).length;
 if(reason!=='natural'||rejected)return {pass:false,rejected,chain:false,extraSendsAfterResult:null};
 if(c.quiet)return {pass:attempts===0,rejected,chain:true,extraSendsAfterResult:attempts};
 const calls=transcript.map((x,index)=>({...x,index})).filter(x=>x.result?.ok&&x.args);
 const finals=transcript.map((x,index)=>({...x,index})).filter(x=>x.agent==='a'&&x.message&&!x.message.tool_calls?.length);
 const finalAfter=index=>finals.some(x=>x.index>index&&c.expected.every(s=>(x.message.content||'').includes(s)));
 let chain=false,resultIndex=-1;
 if(c.id==='E04'||c.id==='E05'){
  const predicates=c.id==='E04'?[()=>true,t=>t.includes('单价'),t=>/3|三/.test(t),t=>t.includes('30')]:[()=>true,t=>c.expected.every(s=>t.includes(s)),t=>c.expected.every(s=>t.includes(s)),()=>true];
  let cursor=-1;
  chain=predicates.every((predicate,i)=>{const from=i%2?'b':'a',to=i%2?'a':'b';const found=calls.find(x=>x.index>cursor&&x.agent===from&&x.args.to===to&&predicate(x.args.text));if(!found)return false;cursor=found.index;return true;})&&finalAfter(cursor);resultIndex=cursor;
 }else if(c.id==='E06'){
  let cursor=-1;
  chain=[['b','17'],['c','29']].every(([peer,value])=>{const ask=calls.find(x=>x.agent==='a'&&x.args.to===peer);const response=ask&&calls.find(x=>x.index>ask.index&&x.agent===peer&&x.args.to==='a'&&x.args.text.includes(value));if(!response)return false;cursor=Math.max(cursor,response.index);return true;})&&finalAfter(cursor);resultIndex=cursor;
 }
 return {pass:chain,rejected,chain,extraSendsAfterResult:chain?transcript.filter((x,i)=>i>resultIndex&&(transcript.some(t=>t.edge)?x.edge:x.call)).length:null};
}
