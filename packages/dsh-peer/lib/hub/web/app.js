let token = '', state;
const $ = id => document.getElementById(id);
const node = (tag, text, className) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; };
async function call(op, args = {}) {
  const r = await fetch('/v1/rpc', { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ op, args }) });
  const value = await r.json(); if (!value.ok) throw new Error(value.error); return value;
}
const labels = { queued: '已受理', claimed: '投递中', delivered: '已送达', consumed: '已消费', unknown: '状态未知', failed: '未送达' };
function render() {
  $('stats').textContent = `${state.sessions.filter(s => s.online).length} 个在线成员 · ${state.messages.filter(m => m.state === 'queued').length} 条待投递消息`;
  $('members').replaceChildren();
  for (const s of state.sessions) {
    const card = node('article', undefined, 'member');
    const status = { idle: '空闲', running: '工作中', waiting: '等待输入', error: '异常' }[s.status] || s.status;
    card.append(node('strong', `@${s.name}`), node('span', s.online ? status : '离线', `state ${s.online ? 'online' : 'offline'}`), node('div', `${s.runtime} · ${s.device}`, 'meta'));
    $('members').append(card);
  }
  if (!state.sessions.length) $('members').append(node('div', '尚无会话注册。配对设备后，在 dsh profile 中启用中心连接。', 'empty'));
  const open = new Set([...$('messages').querySelectorAll('details[open]')].map(n => n.dataset.id));
  $('messages').replaceChildren();
  for (const m of state.messages.slice(-100).reverse()) {
    const detail = node('details', undefined, 'message'); detail.dataset.id = m.id; detail.open = open.has(m.id);
    const [first, ...rest] = m.text.split(/\r?\n/), summary = node('summary'), title = node('span', undefined, 'title');
    title.append(node('span', `来自 @${m.from.name}`, 'sender'), document.createTextNode(first ? ` · ${first}` : ''));
    summary.append(title, node('span', labels[m.state] || m.state, 'status')); detail.append(summary);
    if (rest.length) detail.append(node('div', rest.join('\n'), 'body'));
    detail.append(node('div', `发往 @${m.to.name} · ${new Date(m.createdAt).toLocaleString()}${m.exchange ? ' · ' + m.exchange.kind : ''}`, 'meta'));
    $('messages').append(detail);
  }
  if (!state.messages.length) $('messages').append(node('div', '还没有消息。会话之间的请求与结果将在这里显示。', 'empty'));
  $('protection').replaceChildren();
  const paused = state.directions.filter(d => d.paused); $('protection-section').hidden = !paused.length;
  for (const d of paused) {
    const name = id => state.sessions.find(s => s.session === id)?.name || id;
    const row = node('div', undefined, 'direction'), button = node('button', '恢复接收', 'secondary');
    row.append(node('span', `@${name(d.from)} → @${name(d.to)}`), button);
    button.onclick = async () => { button.disabled = true; try { await call('resume', { from: d.from, to: d.to }); await refresh(); } catch (e) { $('notice').textContent = e.message; button.disabled = false; } };
    $('protection').append(row);
  }
}
async function refresh() {
  $('notice').textContent = '';
  try { state = await call('inspect'); render(); $('login').hidden = true; $('workspace').hidden = false; }
  catch (e) { $('notice').textContent = `连接失败：${e.message}`; throw e; }
}
$('login').onsubmit = e => { e.preventDefault(); token = $('token').value.trim(); $('token').value = ''; void refresh().catch(() => {}); };
$('refresh').onclick = () => { void refresh().catch(() => {}); };
$('logout').onclick = () => { token = ''; state = null; $('workspace').hidden = true; $('login').hidden = false; $('members').replaceChildren(); $('messages').replaceChildren(); $('notice').textContent = ''; };
