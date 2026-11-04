// Mixed mode (0.4): the same-machine channel (registry + Unix socket) is always
// on; a configured centre adds a remote channel. Routing rule:
//   - a target running on this machine (found in the local registry) goes over
//     the socket and never through the centre;
//   - anything else goes through the centre.
// Centre sessions of this device (same credential deviceId) are this machine's
// sessions: they are listed once, as local, and never addressed via the centre.
// A remote session whose name is also a local name is `name@device`.
import { formatList, LIST_LIMIT, bareId } from './core.js';
import { createHubCore } from './hub/core.js';

const LIST_TIMEOUT_MS = 2500;
const withTimeout = (promise, ms) => new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Object.assign(new Error('hub-timeout'), { code: 'hub-unreachable' })), ms); timer.unref?.();
  promise.then(v => { clearTimeout(timer); resolve(v); }, e => { clearTimeout(timer); reject(e); });
});
const ERROR_TEXT = {
  'unknown-peer': '找不到这个 peer', 'ambiguous-peer': '前缀命中多个会话，请用名字或 name@device', 'hub-offline': '中心暂不可达，远端 peer 暂时无法发送；本机会话不受影响',
  self: '不能发给自己', 'not-registered': '本会话没有登记为 peer', 'hub-steer-unsupported': '远端 peer 不支持插话（steer）',
};

export function formatMixedList(entries, { hidden = 0, hubOffline = false } = {}) {
  const cell = v => String(v ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim() || '—';
  const others = entries.filter(e => !e.self);
  const head = (others.length ? '' : '当前没有其他 peer 在线。\n') + (hubOffline ? '中心离线：只列出本机会话，远端 peer 暂不可见。\n' : '');
  const rows = entries.map(e => `| ${cell(e.address)}${e.hubName ? `（中心名 ${cell(e.hubName)}）` : ''}${e.self ? '（本会话）' : e.sameProcess ? '（同进程）' : ''} | ${e.via} | ${cell(e.status)} | ${cell(e.cwd)} | ${cell(e.title)} | ${cell(e.via === 'hub' ? e.device : e.profile)} | ${e.via === 'hub' ? cell(e.runtime) : e.pid} |`);
  const more = hidden > 0 ? `\n\n还有 ${hidden} 个未列出，peer_list 传 all: true 看全部。` : '';
  return `${head}| 地址 | 通道 | 状态 | cwd | 标题 | 设备/profile | 进程/runtime |\n|---|---|---|---|---|---|---|\n${rows.join('\n')}${more}`;
}

// A centre channel that could not be created (missing client package, bad or
// missing credential): the same-machine channel still runs; remote calls fail.
function unavailableHub(error) {
  const text = `中心通道不可用：${error?.message || error}。本机会话不受影响。`;
  const fail = async () => ({ ok: false, wait: false, error: 'hub-offline', text });
  const none = () => {};
  return { deviceId: null, reachable: false, client: null, transport: { path: 'unavailable' }, hubIdOf: none, get: none,
    register: none, unregister: none, setStatus: none, setTitle: none, consume: none, flush: async () => {},
    start: async () => { throw error; }, stop: async () => {}, list: async () => { throw error; },
    send: fail, request: fail, reply: fail, waitFor: fail, rename: fail, protectionStatus: async () => [] };
}

export function createMixedCore({ local, hub: hubConfig, dir, agents, makeMessage, persistMessage, log = () => {} }) {
  let rows = [], rowsAt = 0;
  const localNames = () => new Set(local.entries(null).map(e => e.name));
  async function addressOf(from) {
    if (!localNames().has(from.name)) return from.name;
    let row = rows.find(r => r.session === from.session);
    if (!row) { try { await refresh(); } catch { /* keep the bare name */ } row = rows.find(r => r.session === from.session); }
    return row?.device ? `${from.name}@${row.device}` : from.name;
  }
  let hub;
  try { hub = createHubCore({ hub: hubConfig, dir, agents, makeMessage, persistMessage, log, addressOf }); }
  catch (error) { log(`[dsh-peer] 中心通道不可用，只启用本机通道：${error?.message || error}`); hub = unavailableHub(error); }
  const deviceName = () => { try { return hub.client.credential.name || null; } catch { return null; } };
  async function refresh() { rows = await hub.list(); rowsAt = Date.now(); return rows; }
  const remoteRows = list => list.filter(r => r.deviceId !== hub.deviceId);

  function remoteEntry(r, names) {
    const taken = names.has(r.name);
    return { name: r.name, address: taken && r.device ? `${r.name}@${r.device}` : r.name, session: r.session, nativeSession: r.nativeSession,
      status: r.status, online: r.online, cwd: r.cwd, title: r.title, device: r.device, deviceId: r.deviceId, runtime: r.runtime,
      capabilities: r.capabilities, lastActiveAt: r.lastActiveAt || 0, self: false, sameProcess: false, via: 'hub' };
  }
  // Local rows first (self, running, recent), then remote rows (online first).
  // Centre name of one of this machine's sessions (it may differ from the local name, e.g. `a` vs `a-2`).
  const hubNameOf = (session, list = rows) => hub.get(session)?.hubName || list.find(r => r.deviceId === hub.deviceId && r.nativeSession === session)?.name;
  async function merged(selfId) {
    let hubOffline = false, list = [];
    try { list = await withTimeout(refresh(), LIST_TIMEOUT_MS); } catch { hubOffline = true; }
    const localRows = local.list(selfId).map(e => { const hubName = hubNameOf(e.session, list); return { ...e, address: e.name, via: 'local', ...(hubName && hubName !== e.name ? { hubName } : {}) }; });
    const names = new Set(localRows.map(e => e.name));
    const remote = remoteRows(list).map(r => remoteEntry(r, names)).sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
    return { entries: [...localRows, ...remote], hubOffline };
  }
  async function listView(selfId, { all = false, limit = LIST_LIMIT } = {}) {
    const { entries, hubOffline } = await merged(selfId);
    const self = entries.filter(e => e.self), others = entries.filter(e => !e.self), shown = all ? others : others.slice(0, limit);
    return { entries: [...self, ...shown], hidden: others.length - shown.length, hubOffline };
  }
  async function listText(selfId, options) { const v = await listView(selfId, options); return formatMixedList(v.entries, v); }

  // Address → { channel, target } | { error }. Local always wins and never waits for the centre.
  async function route(to, from) {
    const addr = String(to ?? '').trim().replace(/^@/, '');
    if (!addr) return { error: 'unknown-peer' };
    const at = addr.lastIndexOf('@');
    if (at > 0) {
      const name = addr.slice(0, at), device = addr.slice(at + 1);
      let list; try { list = await withTimeout(refresh(), LIST_TIMEOUT_MS); } catch { list = null; }
      if (device === deviceName()) {
        const mine = local.entries(from).find(e => e.name === name || hubNameOf(e.session, list || rows) === name);
        return mine ? { channel: 'local', target: mine } : { error: 'unknown-peer' };
      }
      if (!list) return { error: 'hub-offline' };
      const row = remoteRows(list).find(r => r.name === name && r.device === device);
      return row ? { channel: 'hub', target: remoteEntry(row, localNames()) } : { error: 'unknown-peer' };
    }
    const found = local.resolveLocal(addr, from);
    if (found.target) return { channel: 'local', target: found.target };
    if (found.error === 'ambiguous-peer') return found;
    let all; try { all = await withTimeout(refresh(), LIST_TIMEOUT_MS); } catch { return { error: 'hub-offline' }; }
    // The centre name of one of this machine's sessions (for example `a-2`) still means that local session.
    const byHubName = local.entries(from).find(e => hubNameOf(e.session, all) === addr);
    if (byHubName) return { channel: 'local', target: byHubName };
    const list = remoteRows(all);
    const names = localNames(), exact = list.find(r => r.name === addr);
    if (exact) return { channel: 'hub', target: remoteEntry(exact, names) };
    const want = bareId(addr);
    const hits = want.length >= 4 ? list.filter(r => bareId(r.nativeSession).startsWith(want) || r.session === addr) : [];
    if (hits.length === 1) return { channel: 'hub', target: remoteEntry(hits[0], names) };
    return { error: hits.length ? 'ambiguous-peer' : 'unknown-peer' };
  }
  const failText = error => `未投递：${ERROR_TEXT[error] || error}（${error}）。`;

  async function send({ to, text, steer = false, from }) {
    if (!local.has(from)) return local.send({ to, text, steer, from });
    const r = await route(to, from);
    if (r.error) return { ok: false, error: r.error, text: failText(r.error) + (r.error === 'hub-offline' ? '' : `\n\n当前列表：\n${await listText(from)}`) };
    if (r.channel === 'local') return local.send({ to: r.target.session, text, steer, from });
    if (r.target.session === hub.hubIdOf(from)) return { ok: false, error: 'self', text: failText('self') };
    if (steer) return { ok: false, error: 'hub-steer-unsupported', text: failText('hub-steer-unsupported') };
    const res = await hub.send({ from, to: r.target.session, text });
    return { ...res, via: 'hub', ...(res.messageId ? { display: { version: 1, id: res.messageId, target: { name: r.target.address, session: r.target.session }, text: String(text ?? ''), outcome: 'accepted' } } : {}) };
  }

  const fail = (error, extra = {}) => ({ ok: false, wait: false, error, text: `请求未完成：${error}。${ERROR_TEXT[error] ? ERROR_TEXT[error] + '。' : ''}不要自动重发；保留已有任务。`, ...extra });
  const CROSS = '跨通道续接：该任务与父任务不在同一通道，不继承父任务的预算与期限（已知限制）。';
  async function request({ from, requests, to, text, wait = true, parentRequestId }) {
    if (requests !== undefined && (to !== undefined || text !== undefined)) return fail('bad-request');
    const items = requests === undefined ? [{ to, text }] : requests;
    if (!Array.isArray(items) || items.length < 1 || items.length > 8 || items.some(item =>
      !item || typeof item.to !== 'string' || !item.to.trim() || typeof item.text !== 'string' || !item.text.trim())) return fail('bad-request');
    if (!local.has(from)) return local.request({ from, requests: items, wait });
    const routes = await Promise.all(items.map(item => route(item.to, from)));
    const parentChannel = parentRequestId === undefined ? null : local.exchangeHas(from, parentRequestId) ? 'local' : 'hub';
    const groups = { local: [], hub: [] }, results = new Array(items.length);
    routes.forEach((r, i) => {
      if (r.error) results[i] = fail(r.error);
      else if (r.channel === 'hub' && r.target.session === hub.hubIdOf(from)) results[i] = fail('self');
      else groups[r.channel].push(i);
    });
    const outcome = {};
    for (const channel of ['local', 'hub']) {
      const index = groups[channel]; if (!index.length) continue;
      const parent = parentChannel === channel ? parentRequestId : undefined;
      const args = { from, requests: index.map(i => ({ to: routes[i].target.session, text: items[i].text })), wait, ...(parent !== undefined ? { parentRequestId: parent } : {}) };
      const res = channel === 'local' ? await local.request(args) : await hub.request(args);
      outcome[channel] = res;
      index.forEach((i, n) => {
        const item = res.requests?.[n] || { ok: false, error: res.error || 'bad-response' };
        results[i] = { ...item, via: channel, ...(parentChannel && parentChannel !== channel ? { crossChannel: true } : {}) };
      });
    }
    // One channel, nothing routed away: hand back that channel's own answer.
    if (!routes.some(r => r.error) && Object.keys(outcome).length === 1 && !parentChannel) {
      const [channel] = Object.keys(outcome), res = outcome[channel];
      return { ...res, requests: results };
    }
    const ok = results.every(r => r.ok), cross = results.some(r => r.crossChannel);
    return { ok, wait: ok && wait !== false, ...(ok ? {} : { error: results.find(r => !r.ok).error }), requests: results,
      text: JSON.stringify(results.map((r, i) => ({ to: items[i].to, ...r }))) + (ok ? '' : '\n已接纳项继续执行；未知回执保留，不自动重发。') + (cross ? `\n${CROSS}` : '') };
  }
  // A reply goes back on the channel the task came on.
  const reply = args => local.exchangeHas(args.from, args.requestId) ? local.reply(args) : hub.reply(args);
  async function waitFor({ from, requestIds }) {
    if (!local.has(from)) return local.waitFor({ from, requestIds });
    if (requestIds !== undefined && !Array.isArray(requestIds)) return local.waitFor({ from, requestIds });
    const mine = requestIds?.filter(id => local.exchangeHas(from, id)), theirs = requestIds?.filter(id => !local.exchangeHas(from, id));
    if (requestIds !== undefined && !theirs.length) return local.waitFor({ from, requestIds: mine });
    if (requestIds !== undefined && !mine.length) return hub.waitFor({ from, requestIds: theirs });
    const l = local.waitFor({ from, requestIds: mine });
    let h; try { h = await withTimeout(hub.waitFor({ from, ...(theirs ? { requestIds: theirs } : {}) }), LIST_TIMEOUT_MS); } catch { h = { ok: false, error: 'hub-unreachable' }; }
    if (!l.ok) return l;
    if (!h.ok) {
      if (requestIds !== undefined) return h;
      return { ...l, text: l.text + (h.error === 'hub-unreachable' ? '\n中心暂不可达：远端任务状态未知。' : '') };
    }
    const waiting = [...(l.requests || []), ...(h.requests || [])];
    const wait = waiting.length > 0 && (l.requests.length ? l.wait : true) && (h.requests?.length ? h.wait : true);
    return { ok: true, wait, requests: waiting, text: JSON.stringify({ requests: waiting, instruction: wait ? '等待远端工作或宿主消费排队消息；不催问。' : waiting.length ? '仍有本地待办，继续处理后再等待。' : '无需等待远端；继续当前工作或向用户汇总。' }) };
  }

  const hubInfo = e => ({ id: e.id, name: e.name, cwd: e.cwd, title: e.title, status: e.status });
  let hubStart = null;
  return {
    mode: 'mixed', pid: local.pid, token: local.token, stats: local.stats, registry: local.registry, client: hub.client, hub,
    transport: { path: `${local.transport.path} + ${hub.transport.path}` },
    get hubReachable() { return hub.reachable; },
    // The same-machine channel is up before the centre is tried; centre failures never stop it.
    async start() {
      await local.start();
      hubStart ||= hub.start().catch(error => log(`[dsh-peer] 中心通道启动失败（本机通道不受影响）：${error?.message || error}`));
      await hubStart;
    },
    async stop() { local.stop(); const starting = hubStart; hubStart = null; await hub.stop().catch(() => {}); await starting; },
    flush() { local.flush(); void hub.flush().catch(() => {}); },
    register(info) { const e = local.register(info); if (e) hub.register(hubInfo(e)); return e; },
    noteUserMessage(id) { const e = local.noteUserMessage(id); if (e) hub.register(hubInfo(e)); return e; },
    unregister(id) { local.unregister(id); hub.unregister(id); },
    setStatus(id, status) { local.setStatus(id, status); hub.setStatus(id, status); },
    setTitle(id, title) { local.setTitle(id, title); hub.setTitle(id, title); },
    consume(id, source) { local.consume(id, source); hub.consume(id, source); },
    has: local.has, isPending: local.isPending, get: local.get,
    async list(selfId) { return (await merged(selfId)).entries; },
    listView, listText,
    async peersText(selfId) {
      const status = (await this.protectionStatus(selfId)).filter(s => s.paused && s.via === 'local');
      return await listText(selfId) + (status.length ? '\n\n接收保护：\n' + status.map(s => `来自 @${s.name} 已暂停；用户可执行 /peer-resume ${s.name}。`).join('\n') : '');
    },
    async rename(id, name) {
      const r = local.rename(id, name); if (!r.ok) return r;
      let h; try { h = await withTimeout(hub.rename(id, r.name), LIST_TIMEOUT_MS); } catch { h = { ok: false, error: 'hub-unreachable' }; }
      if (h.ok && h.name !== r.name) return { ...r, hubName: h.name, text: `${r.text}中心上的名字是 ${h.name}（与远端重名）；远端用 ${h.name} 找本会话。` };
      return h.ok ? r : { ...r, text: `${r.text}中心暂不可达，中心上的名字未更新。` };
    },
    async protectionStatus(selfId) {
      const own = local.protectionStatus(selfId).map(s => ({ ...s, via: 'local' }));
      let remote = [];
      try { remote = (await withTimeout(hub.protectionStatus(selfId), LIST_TIMEOUT_MS)).map(d => ({ from: d.from, to: d.to, paused: !!d.paused, count: d.times?.length || 0, name: rows.find(r => r.session === d.from)?.name || d.from, via: 'hub' })); }
      catch { /* centre offline */ }
      return [...own, ...remote];
    },
    async resume(selfId, address) {
      const r = local.resume(selfId, address); if (r.ok) return r;
      const where = await route(address, selfId);
      return where.channel === 'hub' ? { ok: false, text: '远端方向的暂停由中心管理员恢复；请在中心控制台操作。' } : r;
    },
    send, request, reply, waitFor, route,
  };
}
