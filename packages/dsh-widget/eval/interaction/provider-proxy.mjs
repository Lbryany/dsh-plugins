// Isolated evaluation transport: records provider-visible bodies, never headers or keys.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createCounter } from './token-counter.mjs';
import { parseUsage } from './provider-accounting.mjs';
const [configPath, outputArg, planPath, resumeFlag] = process.argv.slice(2);
const resume = resumeFlag === '--resume';
if (!configPath || !outputArg) throw new Error('Pass private provider JSON and fresh evidence directory');
const config = JSON.parse(await readFile(configPath, 'utf8'));
const plan = JSON.parse(await readFile(planPath ?? new URL('./cases.json', import.meta.url), 'utf8'));
const counter = createCounter(process.env.WIDGET_EVAL_PYTHON, process.env.WIDGET_EVAL_TOKENIZER);
process.on('exit', () => counter.close());
if (config.model !== 'deepseek-flash') throw new Error('Only deepseek-flash is allowed');
const base = new URL(config.baseURL.replace(/\/$/, '') + '/');
if (base.protocol !== 'https:') throw new Error('Provider must use HTTPS');
const output = resolve(outputArg);
if (!resume) await mkdir(output, { recursive: false });
const previous = resume ? JSON.parse(await readFile(join(output, 'usage.json'))) : null;
if (previous?.stopped || (previous && previous.requests !== previous.records.filter(r => r.id).length)) throw new Error('Cannot resume unknown or incomplete provider usage');
let episode = null, count = previous?.requests ?? 0, total = previous?.totalTokens ?? 0, stopped = null, started = previous?.startedAt ?? null, busy = false;
const records = previous?.records ?? [], episodeCounts = new Map();
for (const record of records) if (record.id) episodeCounts.set(record.episode, Math.max(episodeCounts.get(record.episode) ?? 0, record.request));
const additional = process.env.WIDGET_EVAL_ADDITIONAL_REQUESTS === undefined ? Infinity : Number(process.env.WIDGET_EVAL_ADDITIONAL_REQUESTS);
if (!(additional > 0)) throw new Error('Invalid additional-request allowance');
const requestCeiling = Math.min(plan.maxProviderRequests, count + additional);
const port = resume ? new URL(JSON.parse(await readFile(join(output, 'endpoint.json'))).url).port : 0;
const save = () => writeFile(join(output, 'usage.json'), JSON.stringify({ startedAt: started, totalTokens: total, requests: count, stopped, records }, null, 2));
const server = createServer(async (req, res) => {
  let ownsRequest = false, forwarded = false, requestEpisode = episode;
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/episode' && req.method === 'POST') {
      let raw = ''; for await (const chunk of req) raw += chunk;
      const value = JSON.parse(raw);
      if (!/^(baseline|candidate)-[12]-IC-[EN]0[1-6]$/.test(value.id)) throw new Error('Invalid episode ID');
      if (busy) throw new Error('Previous provider request still running');
      episode = value.id; res.end('{}'); return;
    }
    if (url.pathname.endsWith('/models')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ object: 'list', data: [{ id: 'deepseek-flash', object: 'model' }] })); return;
    }
    if (!url.pathname.endsWith('/messages') || req.method !== 'POST' || !episode) throw new Error('Unexpected provider request');
    if (busy) throw new Error('Concurrent provider requests forbidden');
    busy = true; ownsRequest = true; requestEpisode = episode;
    if (!started) started = Date.now();
    if (stopped || Date.now() - started > plan.maxDurationMinutes * 60000 || count >= requestCeiling || total + 30000 > plan.maxTotalTokens) throw new Error('Frozen evaluation budget exhausted');
    const n = (episodeCounts.get(episode) ?? 0) + 1;
    if (n > plan.maxProviderRequestsPerEpisode) throw new Error('Episode request limit reached');
    let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 2_000_000) throw new Error('Oversized request'); }
    const body = JSON.parse(raw);
    if (body.model !== plan.model) throw new Error('Wrong model');
    body.temperature = plan.temperature;
    body.thinking = { type: plan.thinking };
    body.max_tokens = plan.maxOutputTokensPerRequest;
    // Deliberately recorded estimate, followed by authoritative provider usage check.
    const counted = await counter.count(body);
    const estimate = counted.estimate;
    if (estimate > plan.maxInputTokensPerRequest) {
      await writeFile(join(output, `${episode}.${Date.now()}.preflight-rejected.json`), JSON.stringify({ estimate, body }, null, 2));
      throw new Error('Preflight input estimate exceeds frozen limit: ' + estimate);
    }
    episodeCounts.set(episode, n); count++;
    const id = `${String(count).padStart(3, '0')}-${episode}-${n}`;
    await writeFile(join(output, `${id}.request.json`), JSON.stringify(body, null, 2));
    forwarded = true;
    const response = await fetch(new URL('messages', base), {
      method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': config.apiKey },
      body: JSON.stringify(body), signal: AbortSignal.timeout(180000),
    });
    let text = ''; const decoder = new TextDecoder();
    for await (const chunk of response.body) text += decoder.decode(chunk, { stream: true });
    text += decoder.decode();
    await writeFile(join(output, `${id}.response.txt`), text);
    const { input, output: out, usage, complete } = parseUsage(text);
    const status = !response.ok ? 'provider-error' : !complete ? 'incomplete-or-unknown-usage' : input > plan.maxInputTokensPerRequest || out > plan.maxOutputTokensPerRequest ? 'token-cap-exceeded' : 'completed';
    if (Number.isFinite(out)) total += input + out;
    records.push({ id, episode, request: n, status, inputEstimate: estimate, counter: counted, input, output: out ?? null, usage });
    if (status !== 'completed' || total > plan.maxTotalTokens) stopped = status;
    await save();
    // Completion may trigger the next tool step before the upstream socket closes.
    // This quality-only proxy buffers the stream so usage is durable and the lock
    // released before any downstream completion event is observable.
    busy = false; ownsRequest = false;
    res.writeHead(response.status, { 'content-type': response.headers.get('content-type') ?? 'text/event-stream', 'cache-control': 'no-store' });
    res.end(text);
  } catch (error) {
    if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'evaluation_error', message: error.message } }));
    if (forwarded) stopped = 'transport-error-usage-unknown';
    records.push({ episode: requestEpisode, status: forwarded ? 'transport-error-usage-unknown' : 'rejected', message: error.message }); await save();
  } finally { if (ownsRequest) busy = false; }
});
server.listen(Number(port), '127.0.0.1', async () => {
  const port = server.address().port;
  if (port === 3080 || port === 3091) { server.close(); throw new Error('Excluded port'); }
  await writeFile(join(output, 'endpoint.json'), JSON.stringify({ url: `http://127.0.0.1:${port}` }));
  await save();
  console.log(JSON.stringify({ port, output }));
});
