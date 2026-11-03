import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { createStore } from './store.js';
import { createHubService, HubError } from './service.js';

export function createHubServer({ dir, port = 3987, host = '127.0.0.1', now, limits } = {}) {
  if (host !== '127.0.0.1') throw new Error('This version requires a loopback listener (127.0.0.1)');
  if (!dir || !Number.isInteger(port) || port < 0 || port > 65535 || port === 3091) throw new Error('Invalid hub directory or port');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const adminFile = join(dir, 'admin.json');
  if (!existsSync(adminFile)) writeFileSync(adminFile, JSON.stringify({ token: randomBytes(32).toString('base64url') }) + '\n', { flag: 'wx', mode: 0o600 });
  const adminToken = JSON.parse(readFileSync(adminFile, 'utf8')).token;
  if (typeof adminToken !== 'string' || adminToken.length < 32) throw new Error('Invalid administrator credential');
  const store = createStore(dir), service = createHubService({ store, adminToken, now, limits });
  const streams = new Set(); let url, stopped = false;
  function json(res, status, value) {
    if (res.destroyed || res.writableEnded) return;
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(value));
  }
  function notify() { for (const stream of streams) if (!stream.res.destroyed) stream.res.write('data: {"type":"wake"}\n\n'); }
  const server = createServer(async (req, res) => {
    try {
      const port = server.address()?.port;
      const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
      if (!hosts.has(req.headers.host)) throw new HubError('invalid-host', 403);
      if (req.headers.origin && ![...hosts].some(h => req.headers.origin === `http://${h}`)) throw new HubError('foreign-origin', 403);
      const path = new URL(req.url, url).pathname;
      if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true, version: '0.2.0', protocol: 1 });
      if (req.method === 'GET' && ['/', '/app.js', '/style.css'].includes(path)) {
        const file = path === '/' ? 'index.html' : path.slice(1);
        const body = readFileSync(new URL(`./web/${file}`, import.meta.url));
        res.writeHead(200, { 'content-type': path === '/' ? 'text/html; charset=utf-8' : path === '/app.js' ? 'text/javascript; charset=utf-8' : 'text/css; charset=utf-8',
          'cache-control': 'no-store', 'x-content-type-options': 'nosniff',
          'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'" });
        return res.end(body);
      }
      const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
      const auth = service.authenticate(token);
      const generation = req.headers['x-peer-generation'];
      if (req.method === 'GET' && path === '/v1/events') {
        if (auth.admin) throw new HubError('device-required', 403);
        service.current(auth, generation);
        res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-accel-buffering': 'no' });
        const stream = { res, token, generation }; streams.add(stream);
        res.write('data: {"type":"wake"}\n\n');
        const timer = setInterval(() => {
          try { const current = service.authenticate(token); service.current(current, generation); res.write(': heartbeat\n\n'); }
          catch { res.end(); }
        }, 10000);
        res.once('close', () => { clearInterval(timer); streams.delete(stream); });
        return;
      }
      if (req.method !== 'POST' || path !== '/v1/rpc') throw new HubError('not-found', 404);
      if (!req.headers['content-type']?.startsWith('application/json')) throw new HubError('json-required', 415);
      if (Number(req.headers['content-length']) > 65536) { req.resume(); return json(res, 413, { ok: false, error: 'body-too-large' }); }
      let size = 0; const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 65536) { req.resume(); return json(res, 413, { ok: false, error: 'body-too-large' }); }
        chunks.push(chunk);
      }
      let value; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HubError('invalid-json'); }
      if (!value || typeof value.op !== 'string') throw new HubError('bad-request');
      const result = service.run(auth, value.op, value.args, generation);
      json(res, 200, result);
      if (['send', 'request', 'reply', 'sessions.sync', 'rename', 'disconnect', 'device.revoke'].includes(value.op)) notify();
      if (value.op === 'device.revoke') for (const stream of streams) { try { service.authenticate(stream.token); } catch { stream.res.end(); } }
    } catch (error) { json(res, error instanceof HubError ? error.status : 500, { ok: false, wait: false, error: error instanceof HubError ? error.code : 'internal-error' }); }
  });
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  return {
    adminToken, adminFile, store,
    get url() { return url; },
    async start() {
      try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); }); }
      catch (error) { store.close(); stopped = true; throw error; }
      url = `http://${host}:${server.address().port}`;
      return url;
    },
    async stop() {
      if (stopped) return; stopped = true;
      for (const s of streams) s.res.end();
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
      store.close();
    },
  };
}
