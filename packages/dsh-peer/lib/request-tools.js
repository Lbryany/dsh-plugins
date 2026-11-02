import { defineTool } from '@deepseek-ai/dsh-tools';
const output = {
  schema: { type: 'object', additionalProperties: false, properties: {
    ok: { type: 'boolean', required: true }, text: { type: 'string', required: true },
    handoff: { type: 'object', required: true, additionalProperties: false, properties: {
      action: { type: 'string', required: true }, wait: { type: 'boolean', required: true }, ok: { type: 'boolean', required: true },
    } },
  } },
  render: (_args, v) => [{ type: 'text', text: v.text }],
  presentationMeta: (_args, v) => ({ peerExchange: v.handoff }),
};
const wait = { type: 'boolean' };
export function requestTools(core, callerOf) {
  const definitions = [
    { name: 'peer_request', method: 'request',
      description: '单目标用 to/text，多目标一次用 requests（最多8个），互斥且目标必填。忠实用户范围；续轮只发新增决定/变化，不重抄对方已收到的上下文，必要信息补齐。成功默认结束本轮；wait:false 继续本地工作。',
      parameters: { to: { type: 'string' }, text: { type: 'string' }, requests: { type: 'array', items: { type: 'object', additionalProperties: false, properties: {
        to: { type: 'string', required: true }, text: { type: 'string', required: true },
      } } }, wait } },
    { name: 'peer_reply', method: 'reply',
      description: '沿 requestId 回复：执行方 question/result，请求方 answer（带 questionId）。已完成不回复。正文只写新增结论与必要证据。默认结束本轮，wait:false 继续。',
      parameters: { requestId: { type: 'string', required: true }, kind: { type: 'string', required: true, enum: ['question','answer','result'] },
        text: { type: 'string', required: true }, questionId: { type: 'string' }, wait } },
    { name: 'peer_wait', method: 'waitFor',
      description: '让出本轮等待已有任务/排队消息，不发送。省略 IDs 等全部；有本地待办则继续处理。',
      parameters: { requestIds: { type: 'array', items: { type: 'string' } } } },
  ];
  return definitions.map(({ method, ...definition }) => defineTool({ ...definition, output, isConcurrencySafe: () => false,
    async execute(args, exec) {
      const result = await core[method]({ ...args, from: callerOf(exec?.agent) });
      if (result.ok && result.wait) exec.concludeTurn();
      return { ok: result.ok, text: result.text, handoff: { action: definition.name, wait: result.ok && result.wait === true, ok: result.ok } };
    },
  }));
}
