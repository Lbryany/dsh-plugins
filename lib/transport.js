// 跨进程传输：每进程一个 Unix socket，一次连接一条请求，换行分隔 JSON，服务端回一条就关（协议见 README）。
// core 只经 createTransport 的 { start, stop, send } 接触 socket；以后跨机换成 hub 实现（TCP + 鉴权）时 core 不动。
import { chmodSync, unlinkSync } from 'node:fs';
import { createConnection, createServer } from 'node:net';
import { socketPathOf } from './registry.js';

export const MAX_REQUEST_BYTES = 64 * 1024;
export const CLIENT_TIMEOUT_MS = 5000;

// onRequest(request) → 响应对象（可为 Promise）。token 校验由 core 做（core 持有 token），transport 只管收发
export function createTransport({ dir, pid, token: _token, onRequest, path = socketPathOf(dir, pid), timeoutMs = CLIENT_TIMEOUT_MS }) {
  let server = null;
  const sockets = new Set();

  function handle(socket) {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => {});
    socket.setTimeout(timeoutMs, () => socket.destroy());
    let buf = Buffer.alloc(0);
    let done = false;
    const reply = (obj) => { if (!socket.destroyed) socket.end(`${JSON.stringify(obj)}\n`); };
    socket.on('data', async (chunk) => {
      if (done) return;
      buf = Buffer.concat([buf, chunk]);
      const nl = buf.indexOf(0x0a);
      if (nl < 0 && buf.length <= MAX_REQUEST_BYTES) return;
      done = true;
      if (nl < 0 || nl > MAX_REQUEST_BYTES) return reply({ ok: false, error: 'bad-request' });
      let request;
      try { request = JSON.parse(buf.subarray(0, nl).toString('utf8')); } catch { return reply({ ok: false, error: 'bad-request' }); }
      try { reply(await onRequest(request)); } catch { reply({ ok: false, id: request && request.id, error: 'bad-request' }); }
    });
  }

  return {
    path,
    start() {
      if (server) return Promise.resolve();
      if (process.platform !== 'win32') { try { unlinkSync(path); } catch { /* 无残留 */ } }
      server = createServer(handle);
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(path, () => {
          server.off('error', reject);
          if (process.platform !== 'win32') { try { chmodSync(path, 0o600); } catch { /* 目录本身 0700 */ } }
          resolve();
        });
      });
    },
    stop() {
      if (!server) return;
      for (const s of sockets) s.destroy();
      server.close();
      server = null;
      if (process.platform !== 'win32') { try { unlinkSync(path); } catch { /* 已删 */ } }
    },
    // 发一条请求到对方记录里的 socket；连不上 / 超时 / 回包坏都 resolve 成 { ok:false, error }
    send(peerRecord, request) {
      return new Promise((resolve) => {
        let settled = false;
        let buf = '';
        const finish = (value) => { if (settled) return; settled = true; clearTimeout(timer); socket.destroy(); resolve(value); };
        const socket = createConnection(peerRecord.socket);
        const timer = setTimeout(() => finish({ ok: false, id: request.id, error: 'timeout' }), timeoutMs);
        socket.setEncoding('utf8');
        socket.on('connect', () => socket.write(`${JSON.stringify(request)}\n`));
        socket.on('data', (chunk) => {
          buf += chunk;
          const nl = buf.indexOf('\n');
          if (nl < 0) return;
          try { finish(JSON.parse(buf.slice(0, nl))); } catch { finish({ ok: false, id: request.id, error: 'bad-response' }); }
        });
        socket.on('error', () => finish({ ok: false, id: request.id, error: 'unreachable' }));
        socket.on('close', () => finish({ ok: false, id: request.id, error: 'unreachable' }));
      });
    },
  };
}
