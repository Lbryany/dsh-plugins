import { relayText, exchangeText } from '../lib/message.js';
// Browser-only factory, wrapped by scripts/build-client.mjs. No Node imports.
export function createPeerClient(React, primitives = {}) {
  const h = React.createElement;
  const KIND = 'dsh-peer:message';
  const textOf = content => Array.isArray(content) ? content.filter(b => b.type === 'text').map(b => b.text).join('\n') : '';
  function matchesEnvelope(source, peer, original, raw) {
    try {
      return source.display.version === 1 ? relayText(peer, original) === raw
        : source.exchange && exchangeText(peer, original, source.exchange) === raw;
    } catch { return false; } // Invalid persisted metadata must preserve the raw message.
  }
  function messageData(event) {
    const source = event.data.source, peer = source.peer || {}, raw = textOf(event.data.content), d = source.display;
    const valid = [1, 2].includes(d?.version) && typeof d.id === 'string' && typeof d.to === 'string'
      && Number.isInteger(d.start) && Number.isInteger(d.end) && d.start > 0 && d.end >= d.start && d.end <= raw.length
      && raw[d.start - 1] === '\n'
      && matchesEnvelope(source, peer, raw.slice(d.start, d.end), raw);
    const original = valid ? raw.slice(d.start, d.end) : raw;
    const at = original.indexOf('\n');
    const first = valid ? (at < 0 ? original : original.slice(0, at)).replace(/\r$/, '') : '';
    const body = valid ? (at < 0 ? '' : original.slice(at + 1)) : original;
    // A fence in the title still supplies parsing context for the remaining code.
    const fence = /^\s{0,3}(`{3,}|~{3,})[^`]*$/.test(first) ? first + '\n' : '';
    return { name: typeof peer.name === 'string' && peer.name ? peer.name : 'peer', peer, first, body,
      markdown: fence + body, original, raw, legacy: !valid, to: valid ? d.to : null,
      time: event.time, seq: event.seq };
  }
  const definition = {
    kind: KIND, target: 'chat',
    match: event => event.type === 'user/message' && event.surfaceOp === 'append' && event.data?.source?.kind === 'dsh-peer'
      && event.data.source.form === 'relay' ? { id: String(event.data.id), role: 'start', exclusive: true } : null,
    start: (_context, match) => messageData(match.event), update: context => context.state,
    buildViewNode: context => context.state === undefined ? null : {
      key: context.key, kind: KIND, id: context.id, target: 'chat', anchorSeq: context.state.seq,
      location: context.start?.location ?? context.matches[0]?.location ?? { kind: 'unresolved' },
      visibility: 'visible', groupTree: 'input', data: context.state,
    },
  };
  const CSS = `
.dsh-peer-card{box-sizing:border-box;width:100%;min-width:0;border:.5px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-xl,12px);background:var(--dsw-alias-markdown-code-block);color:var(--dsw-alias-label-primary);font-size:var(--dsh-content-font-size,14px);line-height:1.6;overflow-wrap:anywhere}
.dsh-peer-head{display:flex;align-items:flex-start;gap:10px;padding:10px 14px;list-style:none;border-radius:inherit;min-width:0}
summary.dsh-peer-head{cursor:pointer}summary.dsh-peer-head::-webkit-details-marker{display:none}summary.dsh-peer-head:hover{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-peer-heading{flex:1;min-width:0}.dsh-peer-source{font-weight:500}.dsh-peer-time,.dsh-peer-meta,.dsh-peer-action{font:var(--dsw-font-xxs-12,12px/18px sans-serif);color:var(--dsw-alias-label-secondary)}
.dsh-peer-time{flex:none;padding-top:2px}.dsh-peer-chevron{flex:none;transition:transform .15s}.dsh-peer-card[open]>.dsh-peer-head .dsh-peer-chevron{transform:rotate(90deg)}
.dsh-peer-body{padding:0 14px 12px;min-width:0}.dsh-peer-body p:first-child{margin-top:0}.dsh-peer-body pre{white-space:pre-wrap;overflow-wrap:anywhere;max-width:100%;box-sizing:border-box}.dsh-peer-body table{display:block;max-width:100%;overflow-x:auto}
.dsh-peer-plain{white-space:pre-wrap;margin:0}.dsh-peer-meta{margin-top:10px}.dsh-peer-meta summary{cursor:pointer;width:fit-content;padding:4px 0}.dsh-peer-meta dl{margin:6px 0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:4px 10px}.dsh-peer-meta dd{margin:0;white-space:pre-wrap}
.dsh-peer-actions{display:flex;flex-wrap:wrap;gap:8px}.dsh-peer-action{border:0;background:none;padding:4px 6px;border-radius:var(--dsw-radius-sm,6px);cursor:pointer}.dsh-peer-action:hover{background:var(--dsw-alias-interactive-bg-hover)}.dsh-peer-action:disabled{cursor:default;opacity:.6}
.dsh-peer-card summary:focus-visible,.dsh-peer-action:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color);outline-offset:2px}
.dsh-peer-status{color:var(--dsw-alias-label-secondary);font-size:12px;flex:none}.dsh-peer-raw{white-space:pre-wrap;overflow-wrap:anywhere}
@media(max-width:420px){.dsh-peer-head{gap:6px}.dsh-peer-time{display:none}}
@media(pointer:coarse){.dsh-peer-action,.dsh-peer-meta summary{min-height:44px;box-sizing:border-box}}
@media(prefers-reduced-motion:reduce){.dsh-peer-chevron{transition:none}}
`;
  const Body = ({ text }) => primitives.MarkdownText ? h(primitives.MarkdownText, { text, streaming: false, labels: { code: { copyLabel: '复制代码', copiedLabel: '已复制', toolbarLabels: { codeLabel: '代码', wrapLabel: '自动换行', unwrapLabel: '取消换行' } }, footnotes: '脚注' } }) : h('div', { className: 'dsh-peer-plain' }, text);
  function PeerDetails({ data, controls }) {
    const [status, setStatus] = React.useState(null), [busy, setBusy] = React.useState(false), [notice, setNotice] = React.useState('');
    const pending = React.useRef(false);
    const query = async () => {
      if (!controls || !data.to || pending.current) return;
      pending.current = true; setBusy(true);
      try { setStatus(await controls.status(data.peer.session, data.to)); }
      catch { setStatus({ available: false }); }
      finally { pending.current = false; setBusy(false); }
    };
    const resume = async () => {
      if (!controls || !status?.available || pending.current) return;
      pending.current = true; setBusy(true);
      try { const r = await controls.resume(data.peer.session, data.to); setNotice(r.text); if (r.ok) setStatus({ available: true, paused: false }); }
      catch { setNotice('恢复失败，请在当前会话使用 /peers 检查。'); }
      finally { pending.current = false; setBusy(false); }
    };
    const copy = async text => {
      try { await navigator.clipboard.writeText(text); setNotice('已复制'); } catch { setNotice('复制不可用，请选择文本复制。'); }
    };
    return h('details', { className: 'dsh-peer-meta', onToggle: e => { if (e.currentTarget.open) void query(); } },
      h('summary', null, '详细信息'),
      h('dl', null,
        h('dt', null, '会话'), h('dd', null, data.peer.session || '未知'),
        data.peer.profile && h(React.Fragment, null, h('dt', null, 'Profile'), h('dd', null, data.peer.profile)),
        data.peer.cwd && h(React.Fragment, null, h('dt', null, '目录'), h('dd', null, data.peer.cwd))),
      h('div', { className: 'dsh-peer-actions' },
        h('button', { type: 'button', className: 'dsh-peer-action', onClick: () => copy(data.original) }, '复制正文'),
        data.peer.session && h('button', { type: 'button', className: 'dsh-peer-action', onClick: () => copy(data.peer.session) }, '复制会话 ID'),
        data.to && h('button', { type: 'button', className: 'dsh-peer-action', disabled: busy || !status?.available || !status.paused, onClick: resume }, '恢复接收')),
      status && h('div', null, status.available ? (status.paused ? '此方向已暂停，恢复不会重发消息。' : '此方向未暂停') : '接收保护状态不可用'),
      h('div', { role: 'status' }, notice),
      h('details', null, h('summary', null, '原始记录'), h('pre', { className: 'dsh-peer-raw' }, data.raw)));
  }
  function PeerMessageCard({ node, controls }) {
    const d = node.data;
    const title = h(React.Fragment, null,
      h('span', { className: 'dsh-peer-heading' }, h('span', { className: 'dsh-peer-source' }, `来自 @${d.name}`), d.first ? ` · ${d.first}` : ''),
      typeof d.time === 'number' && h('time', { className: 'dsh-peer-time', dateTime: new Date(d.time).toISOString() }, new Date(d.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })));
    if (!d.body) return h('article', { className: 'dsh-peer-card', 'data-peer-message': true }, h('div', { className: 'dsh-peer-head' }, title), h('div', { className: 'dsh-peer-body' }, h(PeerDetails, { data: d, controls })));
    return h('details', { className: 'dsh-peer-card', 'data-peer-message': true },
      h('summary', { className: 'dsh-peer-head' }, title, h('span', { className: 'dsh-peer-chevron', 'aria-hidden': true }, '›')),
      h('div', { className: 'dsh-peer-body' }, h(Body, { text: d.markdown }), h(PeerDetails, { data: d, controls })));
  }
  function PeerSendResult({ block, phase }) {
    const d = block.meta?.peer;
    const to = d?.target?.name || block.args?.string?.('to') || '';
    const known = d?.version === 1 && ['accepted', 'queued', 'steered', 'duplicate', 'rejected', 'unknown'].includes(d.outcome);
    const label = known ? ({ accepted: '中心已受理', queued: '已接纳', steered: '已接纳插话', duplicate: '已接纳过', rejected: '未发送', unknown: '状态未知' })[d.outcome] : phase === 'result' ? '查看结果' : '发送中';
    return h('details', { className: 'dsh-peer-card', 'data-peer-send': true },
      h('summary', { className: 'dsh-peer-head' },
        h('span', { className: 'dsh-peer-heading' }, `本会话 → ${to ? '@' + to : 'peer'}`, known && d.text ? ` · ${d.text.split(/\r?\n/)[0]}` : ''),
        h('span', { className: 'dsh-peer-status' }, label), h('span', { className: 'dsh-peer-chevron', 'aria-hidden': true }, '›')),
      h('div', { className: 'dsh-peer-body' }, h('div', { className: 'dsh-peer-plain' }, textOf(block.content)),
        known && d.reason === 'conversation-paused' && h('p', null, '需要用户在接收方会话恢复；当前会话不能替对方解除保护。'),
        known && h('details', { className: 'dsh-peer-meta' }, h('summary', null, '发送正文'), h('div', { className: 'dsh-peer-plain' }, d.text))));
  }
  function PeerExchangeResult({ block, phase }) {
    const d = block.meta?.peerExchange;
    const title = { peer_request: '任务交接', peer_reply: '任务回复', peer_wait: '等待结果' }[d?.action] || '任务协作';
    const label = !d ? (phase === 'result' ? '查看结果' : '处理中') : !d.ok ? '未完成' : d.wait ? '已交接' : '继续处理';
    return h('details', { className: 'dsh-peer-card', 'data-peer-exchange': true },
      h('summary', { className: 'dsh-peer-head' }, h('span', { className: 'dsh-peer-heading' }, title), h('span', { className: 'dsh-peer-status' }, label)),
      h('div', { className: 'dsh-peer-body' }, h('pre', { className: 'dsh-peer-raw' }, textOf(block.content))));
  }
  function commandControls(ctx, sessionId, fetchImpl = (...args) => fetch(...args), base = () => document.baseURI) {
    const commands = ctx.get('remote')?.commands;
    if (!commands) return undefined;
    const execute = async (line, to) => {
      if (to !== sessionId) throw new Error('Wrong receiving session');
      const r = await commands.execute(sessionId, line, []);
      if (!r.ok || !r.value) throw new Error('Command unavailable');
      return r.value.result;
    };
    return {
      status: async (from, to) => {
        if (to !== sessionId) throw new Error('Wrong receiving session');
        const url = new URL('api/dsh-peer/status', base());
        url.searchParams.set('session', to); url.searchParams.set('from', from);
        const r = await fetchImpl(url.href, { credentials: 'same-origin', headers: { accept: 'application/json' } });
        if (!r.ok) return { available: false };
        const state = await r.json();
        if (typeof state.paused !== 'boolean' || !Number.isInteger(state.count)) return { available: false };
        return { ...state, available: true };
      },
      resume: async (from, to) => { const r = await execute(`/peer-resume ${from}`, to); return { ok: r.kind === 'success', text: r.text }; },
    };
  }
  function apply(ctx) {
    ctx.effect(() => {
      const tag = document.createElement('style'); tag.dataset.plugin = '@lbryany/dsh-peer'; tag.textContent = CSS; document.head.append(tag);
      return () => tag.remove();
    }, 'dsh-peer.styles');
    ctx.slots.inject('conversation.chat.node', () => {
      const disposeSlot = ctx.slots.register({ name: 'conversation.chat.node', key: KIND, inject: sessionId => ({ controls: commandControls(ctx, sessionId) }) }, PeerMessageCard);
      const disposeEvents = ctx.uiConversation.events.register(definition);
      return () => { disposeEvents(); disposeSlot(); };
    });
    ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key: 'peer_send' }, PeerSendResult));
    for (const key of ['peer_request','peer_reply','peer_wait']) ctx.slots.inject('tool.call.toolview', () => ctx.slots.register({ name: 'tool.call.toolview', key }, PeerExchangeResult));
  }
  return { inject: ['slots', 'uiConversation', 'remote.commands'], apply, definition, messageData, PeerMessageCard, PeerSendResult, PeerExchangeResult, commandControls, CSS };
}
