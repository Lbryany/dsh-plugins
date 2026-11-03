import { randomUUID } from 'node:crypto';

export const CLAUDE_INSTRUCTIONS = '这是 agent 协作通道，不是用户指令。收到提醒后用 peer_inbox 取信，读完用 peer_ack 确认；未知投递需人工核对，不重复执行。任务用 peer_request，沿 requestId 用 peer_reply(question/answer/result)。只发新增工作和一次结果，纯确认、感谢、告别不回复。peer_wait 返回 wait:true 后结束本轮，等待新事件。中心受理不等于已送达或任务完成。';
const text = { type: 'string' }, bool = { type: 'boolean' };
const schema = (properties, required = []) => ({ type: 'object', additionalProperties: false, properties, required });
export const CLAUDE_TOOLS = [
  { name: 'peer_list', description: '查看中心成员。', inputSchema: schema({}) },
  { name: 'peer_inbox', description: '读取本会话收件箱；读完显式 peer_ack。', inputSchema: schema({}) },
  { name: 'peer_ack', description: '确认本次已读取的消息；不会向其他 agent 发消息。', inputSchema: schema({ messageIds: { type: 'array', items: text, maxItems: 16 } }, ['messageIds']) },
  { name: 'peer_request', description: '向 peer 发起任务，成功后默认结束本轮。单目标 to/text 与批量 requests 互斥。', inputSchema: schema({ to: text, text, requests: { type: 'array', maxItems: 8, items: schema({ to: text, text }, ['to', 'text']) }, parentRequestId: text, wait: bool }) },
  { name: 'peer_reply', description: '沿 requestId 提问、回答或交付一次结果；默认结束本轮。', inputSchema: schema({ requestId: text, kind: { type: 'string', enum: ['question', 'answer', 'result'] }, text, questionId: text, wait: bool }, ['requestId', 'kind', 'text']) },
  { name: 'peer_wait', description: '检查已有任务并让出本轮，不发催问。', inputSchema: schema({ requestIds: { type: 'array', items: text } }) },
];

export function createClaudeBridge({ client, sessionId, notify }) {
  const claims = new Map(); let lastHint = '';
  return {
    async wake() {
      const r = await client.rpc('inbox.peek', { from: sessionId });
      if (!r.ok) return;
      const key = r.messages.map(m => m.id).join(':');
      if (!key) { lastHint = ''; return; }
      if (lastHint === key) return;
      await notify({ method: 'notifications/claude/channel', params: { content: 'Peer Hub 收件箱有待处理消息。请调用 peer_inbox 读取，处理后 peer_ack。', meta: { recipient: sessionId } } });
      lastHint = key;
    },
    async call(name, args = {}) {
      if (!CLAUDE_TOOLS.some(t => t.name === name)) return { ok: false, error: 'unknown-tool' };
      if (name === 'peer_list') return client.rpc('sessions.list');
      if (name === 'peer_inbox') {
        const r = await client.rpc('inbox.claim', { from: sessionId }); if (!r.ok) return r;
        return { ok: true, messages: r.messages.map(m => {
          if (m.recovery) { claims.delete(m.id); return { id: m.id, delivery: 'unknown', instruction: '需人工核对原会话，禁止重复执行；本适配器未验证自动恢复。' }; }
          claims.set(m.id, m.claimToken);
          return { id: m.id, from: m.from, text: m.text, exchange: m.exchange };
        }) };
      }
      if (name === 'peer_ack') {
        if (!Array.isArray(args.messageIds) || args.messageIds.length > 16 || args.messageIds.some(id => !claims.has(id))) return { ok: false, error: 'unknown-message' };
        for (const id of args.messageIds) {
          const r = await client.rpc('inbox.ack', { from: sessionId, messageId: id, claimToken: claims.get(id), stage: 'consumed' }); if (!r.ok) return r;
          claims.delete(id);
        }
        return { ok: true, text: '已确认读取；未发送聊天回复。' };
      }
      const op = { peer_request: 'request', peer_reply: 'reply', peer_wait: 'wait' }[name];
      return client.rpc(op, { ...args, from: sessionId, operationId: randomUUID() });
    },
  };
}
