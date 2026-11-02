// Explicitly supplied isolated profile copy only; no implicit reads of ~/.dsh.
import {readFileSync,realpathSync} from 'node:fs';
import {join,resolve,dirname,sep} from 'node:path';
import {homedir} from 'node:os';
import {createRequire} from 'node:module';
const copy=realpathSync(process.argv[2]||'');
const original=resolve(homedir(),'.dsh');
if(copy===original||copy.startsWith(original+sep))throw Error('Use an isolated copy, not the real DSH home');
const bin=process.env.DSH_BIN||'/opt/homebrew/lib/node_modules/@deepseek-ai/dsh/lib/bin.js';
const require=createRequire(join(dirname(dirname(bin)),'package.json')),YAML=require('yaml');
const credentials=YAML.parse(readFileSync(join(copy,'.credentials.yaml'),'utf8'));
const key=credentials.refs?.DEEPSEEK_API_KEY;
if(typeof key!=='string'||!key.trim())throw Error('Copied profile has no DeepSeek API key');
const patch=YAML.parse(readFileSync(join(copy,'profiles/projects-thread/cordis.patch.yml'),'utf8'))||[];
const config=patch.find(row=>row.id==='llm-deepseek-api-key')?.config||{};
const {resolveAdapterOptions}=require('@deepseek-ai/dsh-llm-deepseek');
const options=resolveAdapterOptions(config,{get:name=>process.env[name]?{value:process.env[name]}:undefined});
const base=options.baseURL.replace(/\/+$/,'');
process.env.DSH_PEER_EVAL_API_KEY=key;
process.env.DSH_PEER_EVAL_URL=base+(new URL(base).pathname.endsWith('/v1')?'':'/v1')+'/messages';
process.env.DSH_PEER_EVAL_CREDENTIAL_SOURCE='user-authorized isolated projects-thread profile copy';
console.log('Using copied profile: deepseek-flash, Messages, temperature 0, thinking disabled');
try{await import('./run.mjs');}finally{delete process.env.DSH_PEER_EVAL_API_KEY;}
