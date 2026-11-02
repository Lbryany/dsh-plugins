// Resource-bundle evaluation, not an end-to-end test of DSH skill selection.
// Usage: node eval/run.mjs /absolute/private/provider.json /absolute/output
// Provider JSON: { model: "deepseek-flash", baseURL, apiKey }. Never logged.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const plan = JSON.parse(await readFile(new URL('./cases.json', import.meta.url), 'utf8'));
const [providerPath, outputPath] = process.argv.slice(2);
if (!providerPath || !outputPath) throw new Error('Pass a private provider JSON path and a fresh output directory.');
const provider = JSON.parse(await readFile(resolve(providerPath), 'utf8'));
if (provider.model !== plan.model || plan.model !== 'deepseek-flash') throw new Error('Only deepseek-flash is allowed.');
const endpoint = new URL(provider.baseURL.replace(/\/$/, '') + '/messages');
if (endpoint.protocol !== 'https:') throw new Error('The provider endpoint must use HTTPS.');
const output = resolve(outputPath);
await mkdir(output, { recursive: true });
// Refuse to overwrite an existing run, including failed runs.
await writeFile(join(output, 'plan.json'), JSON.stringify(plan, null, 2), { flag: 'wx' });
const source = async (group, path) => group === 'baseline'
  ? execFileSync('git', ['show', `${plan.baseline}:packages/dsh-widget/${path}`], { cwd: root, encoding: 'utf8' })
  : readFile(join(root, path), 'utf8');
let total = 0;
const deadline = Date.now() + 20 * 60_000;
const results = [];
// Interleave conditions; one request at a time keeps budgets enforceable.
for (const task of plan.cases) {
  for (const group of ['baseline', 'candidate']) {
    if (Date.now() >= deadline || total + plan.maxInputTokens + plan.maxOutputTokens > plan.maxTotalTokens) throw new Error('Frozen run budget exhausted.');
    const files = ['assets/visualize-skill.md', 'assets/references/design.md', 'assets/references/charts.md', 'assets/styles/whale.md'];
    files.push(...group === 'baseline'
      ? ['assets/examples/interactive-simulator.html', 'assets/examples/comparison-chart.html']
      : ['assets/references/patterns.md', `assets/examples/${task.id}.html`]);
    const parts = await Promise.all(files.map(async path => `RESOURCE ${path}\n${await source(group, path)}`));
    const system = 'Produce a visualization using the supplied authoring resources. They are already loaded; no tools are available. Return ONLY one JSON object with title, mode, summary and fragment, ready for visualize. Use the whale style. No markdown fences. The actual task is in the user message.\n\n' + parts.join('\n\n');
    const request = { model: plan.model, max_tokens: plan.maxOutputTokens, temperature: 0.5, thinking: { type: 'disabled' }, stream: false, system, messages: [{ role: 'user', content: task.prompt + '\nUse mode: ' + task.mode }] };
    const id = `${task.id}-${group}`;
    await writeFile(join(output, `${id}.request.json`), JSON.stringify(request, null, 2));
    console.log(`start ${id}`);
    let record;
    try {
      const response = await fetch(endpoint, { method: 'POST', redirect: 'error', headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', 'x-api-key': provider.apiKey }, body: JSON.stringify(request), signal: AbortSignal.timeout(Math.min(180_000, deadline - Date.now())) });
      if (!response.ok) { record = { id, status: 'provider-error', httpStatus: response.status }; }
      else {
        const body = await response.json();
        await writeFile(join(output, `${id}.response.json`), JSON.stringify(body, null, 2));
        const usage = body.usage;
        const input = usage && Number(usage.input_tokens) + Number(usage.cache_read_input_tokens ?? 0) + Number(usage.cache_creation_input_tokens ?? 0);
        const out = usage && Number(usage.output_tokens);
        if (!Number.isFinite(input) || !Number.isFinite(out)) throw new Error('usage-missing');
        total += input + out;
        const text = body.content.filter(x => x.type === 'text').map(x => x.text).join('');
        await writeFile(join(output, `${id}.txt`), text);
        let value;
        try { value = JSON.parse(text); } catch { /* Invalid output is retained as a failure. */ }
        const status = input > plan.maxInputTokens || out > plan.maxOutputTokens ? 'token-cap-exceeded' : value && typeof value.fragment === 'string' && value.mode === task.mode ? 'generated' : 'invalid-output';
        record = { id, status, inputTokens: input, outputTokens: out, stopReason: body.stop_reason, promptSha256: createHash('sha256').update(system).digest('hex') };
        if (status === 'generated') await writeFile(join(output, `${id}.json`), JSON.stringify(value, null, 2));
      }
    } catch (e) { record = { id, status: 'request-failed', reason: e instanceof Error && e.message === 'usage-missing' ? 'usage-missing' : 'transport-or-timeout' }; }
    results.push(record);
    await writeFile(join(output, 'results.json'), JSON.stringify({ model: plan.model, baseline: plan.baseline, totalTokens: total, results }, null, 2));
    console.log(`${id}: ${record.status}; total tokens ${total}`);
    // Infrastructure failure is not a reason to spend on eleven more failures.
    if (['provider-error', 'request-failed', 'token-cap-exceeded'].includes(record.status)) process.exitCode = 1;
    if (process.exitCode) break;
  }
  if (process.exitCode) break;
}
