export function parseUsage(text) {
  let usage = {}, stopped = false, failed = false;
  for (const line of text.split('\n')) {
    if (!line.startsWith('data: ')) continue;
    try {
      const event = JSON.parse(line.slice(6));
      Object.assign(usage, event.message?.usage ?? {}, event.usage ?? {});
      if (event.type === 'message_stop') stopped = true;
      if (event.error || event.type === 'error') failed = true;
    } catch { failed = true; }
  }
  if (!text.includes('data: ')) {
    try { const body = JSON.parse(text); usage = body.usage ?? {}; stopped = !!body.stop_reason; failed = !!body.error; }
    catch { failed = true; }
  }
  const input = ['input_tokens', 'cache_read_input_tokens', 'cache_creation_input_tokens'].reduce((sum, key) => sum + (usage[key] ?? 0), 0);
  const output = usage.output_tokens;
  return { input, output, usage, complete: stopped && !failed && Number.isFinite(input) && input > 0 && Number.isFinite(output) };
}
