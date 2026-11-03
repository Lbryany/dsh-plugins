import { readFileSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const sleep = (ms, signal) => new Promise(resolve => {
  if (signal?.aborted) return resolve();
  const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', done); resolve(); };
  const timer = setTimeout(done, ms); signal?.addEventListener('abort', done, { once: true });
});

export function createHubClient(config) {
  const stat = statSync(config.credentialFile);
  if (!stat.isFile() || (stat.mode & 0o077)) throw new Error('Hub credential file must be owner-only (chmod 600)');
  const credential = JSON.parse(readFileSync(config.credentialFile, 'utf8'));
  const endpoint = new URL(config.url || credential.url);
  if (endpoint.protocol !== 'http:' || endpoint.hostname !== '127.0.0.1' || endpoint.username || endpoint.password || endpoint.search || endpoint.hash || endpoint.pathname !== '/') throw new Error('Local hub URL must be http://127.0.0.1:<port>');
  if (typeof credential.token !== 'string' || !credential.deviceId) throw new Error('Invalid hub credential');
  const url = endpoint.origin, generation = randomUUID();
  const headers = { authorization: `Bearer ${credential.token}`, 'content-type': 'application/json', 'x-peer-generation': generation };
  let controller = new AbortController(), streamTask;
  async function rpc(op, args = {}) {
    if (op === 'inbox.claim' && !args.operationId) args = { ...args, operationId: randomUUID() };
    const body = JSON.stringify({ op, args });
    if (Buffer.byteLength(body) > 65536) return { ok: false, wait: false, error: 'body-too-large', text: '消息过长，中心未受理。' };
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await fetch(url + '/v1/rpc', { method: 'POST', headers, body, redirect: 'error', signal: AbortSignal.timeout(5000) });
        const value = await response.json();
        if (typeof value?.ok !== 'boolean') throw new Error('bad-response');
        return { ...value, ...(value.ok ? {} : { text: value.text || `中心操作失败：${value.error}。停止自动重发。`, wait: false }) };
      } catch {
        // Identical request body / operation ID on transport retry. The server
        // commits the operation result with its side effects.
        if (attempt === 0 && !controller.signal.aborted) { await sleep(80, controller.signal); continue; }
        return { ok: false, wait: false, error: 'hub-unreachable', uncertain: true, text: '中心暂不可达，受理状态未知；不要创建新消息重发。' };
      }
    }
  }
  return {
    url, generation, deviceId: credential.deviceId, rpc,
    async start(onWake, onConnected = () => {}) {
      controller = new AbortController();
      const signal = controller.signal;
      let connectDelay = 200;
      while (!signal.aborted) {
        const result = await rpc('connect');
        if (result.ok) break;
        if (!['device-in-use', 'hub-unreachable'].includes(result.error)) throw new Error(result.error);
        await sleep(connectDelay, signal); connectDelay = Math.min(connectDelay * 2, 5000);
      }
      if (signal.aborted) return;
      streamTask = (async () => {
        let delay = 200;
        while (!signal.aborted) {
          try {
            const response = await fetch(url + '/v1/events', { headers, redirect: 'error', signal });
            if (!response.ok || !response.body) { if ([401, 409].includes(response.status)) return; throw new Error('event-stream'); }
            delay = 200; await onConnected();
            const decoder = new TextDecoder(); let buffer = '';
            for await (const chunk of response.body) {
              buffer += decoder.decode(chunk, { stream: true });
              if (buffer.length > 65536) throw new Error('event-too-large');
              let at;
              while ((at = buffer.indexOf('\n\n')) >= 0) {
                const frame = buffer.slice(0, at); buffer = buffer.slice(at + 2);
                if (frame.startsWith('data:')) await onWake();
              }
            }
          } catch { /* The inbox is read again after reconnect. */ }
          await sleep(delay, signal); delay = Math.min(delay * 2, 5000);
        }
      })();
    },
    async stop() { controller.abort(); await streamTask; await rpc('disconnect'); },
  };
}
