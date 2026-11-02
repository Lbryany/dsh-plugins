import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
const root = process.argv[2];
const plan = JSON.parse(await readFile(join(root, 'plan.json'), 'utf8'));
for (let run = 1; run <= plan.runsPerCasePerVariant; run++) {
  for (const task of plan.cases) for (const variant of plan.variantOrderByRun[run - 1]) {
    const id = `${variant}-${run}-${task.id}`, out = join(root, 'episodes', id);
    try { await access(join(out, 'result.json')); continue; } catch {}
    const usage = JSON.parse(await readFile(join(root, 'model-run/usage.json'), 'utf8'));
    if (usage.stopped || usage.totalTokens + 30000 > plan.maxTotalTokens || usage.requests >= plan.maxProviderRequests) {
      await mkdir(out, { recursive: true });
      await writeFile(join(out, 'result.json'), JSON.stringify({ id, task, status: 'not-run-budget-or-provider-stop', reason: usage.stopped ?? 'frozen-total-token-reserve' }, null, 2));
      console.log(JSON.stringify({ id, status: 'not-run-budget-or-provider-stop' })); continue;
    }
    const code = await new Promise(resolve => {
      const child = spawn(process.execPath, [new URL('./run-episode.mjs', import.meta.url).pathname, root, variant, String(run), task.id], { stdio: 'inherit' });
      child.on('exit', resolve);
    });
    if (code !== 0) throw new Error('Driver failed: ' + id);
  }
}
