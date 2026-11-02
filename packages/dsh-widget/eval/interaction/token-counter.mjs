import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
export function createCounter(python, tokenizer) {
  if (!python || !tokenizer) throw new Error('Set WIDGET_EVAL_PYTHON and WIDGET_EVAL_TOKENIZER');
  const child = spawn(python, [new URL('./count-tokens.py', import.meta.url).pathname, tokenizer], { stdio: ['pipe', 'pipe', 'pipe'] });
  const pending = new Map(); let next = 0, stderr = '';
  child.stderr.on('data', part => { stderr = (stderr + part).slice(-2000); });
  const rejectAll = error => { for (const entry of pending.values()) entry.reject(error); pending.clear(); };
  child.on('error', rejectAll);
  child.on('exit', code => rejectAll(new Error(`Token counter exited (${code}): ${stderr}`)));
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => {
    try { const data = JSON.parse(line), waiter = pending.get(data.id); if (!waiter) return; pending.delete(data.id); data.error ? waiter.reject(new Error(data.error)) : waiter.resolve(data); }
    catch (error) { rejectAll(error); }
  });
  return {
    count(body) { return new Promise((resolve, reject) => { const id = ++next; pending.set(id, { resolve, reject }); child.stdin.write(JSON.stringify({ id, body }) + '\n', error => { if (error) { pending.delete(id); reject(error); } }); }); },
    close() { lines.close(); child.kill(); rejectAll(new Error('Token counter closed')); },
  };
}
