// Collect actual plugin registrations; use the installed Host's order and renderer.
import {createRequire} from 'node:module';
import {dirname,join} from 'node:path';
const bin=process.env.DSH_BIN||'/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js';
const require=createRequire(join(dirname(dirname(bin)),'package.json'));
const {SystemPrompt,renderPrompt}=require('@deepseek-ai/dsh-system-prompt');
export function captureHostPrompt(){
 const sections=new Map();
 const order=name=>SystemPrompt.prototype.getSectionOrder(name);
 return {
  service:{getSectionOrder:order,section(section){
   if(section.complete||sections.has(section.name)||!Number.isFinite(section.order))throw Error('Unsupported or duplicate native section');
   sections.set(section.name,section);return()=>sections.delete(section.name);
  }},
  entries:()=>[...sections.values()],
  render(scenario,agent){
   const all=[{name:'eval:scenario-persona',order:order('DEPLOYMENT_PERSONA_PREFIX'),text:scenario,interpolate:false},...sections.values()]
    .sort((a,b)=>a.order-b.order||(a.name<b.name?-1:a.name>b.name?1:0))
    .map(s=>({...s,text:typeof s.text==='function'?s.text({agent}):s.text}));
   return renderPrompt({sections:all,variables:{},contexts:[],tools:[]});
  },
 };
}
