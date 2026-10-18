import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type Context,
  type Model,
  type Models,
  type SimpleStreamOptions,
} from '@earendil-works/pi-ai'
import { createMessage, ReasoningEffortId, ToolCallId, type GenerateOptions } from '@deepseek-ai/dsh-llm'

import { CodeBuddyAdapter } from '../src/adapter.ts'
import { conversationIdFor } from '../src/codebuddy.ts'
import { RequestContextTracker } from '../src/request-context.ts'

const model: Model<'openai-completions'> = {
  id: 'reasoner',
  name: 'Reasoner',
  api: 'openai-completions',
  provider: 'codebuddy',
  baseUrl: 'https://example.test/v2',
  reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 123_000,
  maxTokens: 24_000,
}

function successfulMessage(): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'ok' }],
    api: 'openai-completions',
    provider: 'codebuddy',
    model: model.id,
    usage: {
      input: 10,
      output: 2,
      cacheRead: 3,
      cacheWrite: 0,
      reasoning: 1,
      totalTokens: 15,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function fakeModels(doneReason: 'stop' | 'deferred' = 'stop'): Models {
  return {
    refresh: async () => ({ aborted: false, errors: new Map() }),
    getModels: () => [model],
    getModel: (_provider: string, id: string) => id === model.id ? model : undefined,
    streamSimple: (
      _model: Model<'openai-completions'>,
      _context: Context,
      options?: SimpleStreamOptions,
    ) => {
      assert.equal(options?.reasoning, 'medium')
      const stream = createAssistantMessageEventStream()
      const message = successfulMessage()
      queueMicrotask(() => {
        stream.push({ type: 'start', partial: message })
        stream.push({ type: 'text_start', contentIndex: 0, partial: message })
        stream.push({ type: 'text_delta', contentIndex: 0, delta: 'ok', partial: message })
        stream.push({ type: 'text_end', contentIndex: 0, content: 'ok', partial: message })
        stream.push({ type: 'done', reason: doneReason, message })
        stream.end(message)
      })
      return stream
    },
  } as unknown as Models
}

test('adapter exposes CodeBuddy grouping, dynamic models, and reasoning levels', async () => {
  const adapter = new CodeBuddyAdapter(fakeModels())
  assert.deepEqual(adapter.providerInfo('codebuddy'), { id: 'codebuddy', name: 'CodeBuddy' })
  assert.deepEqual(await adapter.listModels('codebuddy'), [{
    provider: 'codebuddy', id: 'reasoner', name: 'Reasoner', inputModalities: ['text'],
  }])

  const resolved = await adapter.resolveModel('codebuddy', 'reasoner')
  assert.equal(resolved.context?.contextWindow, 123_000)
  assert.equal(resolved.defaultMaxTokens, 24_000)
  assert.deepEqual(resolved.reasoning?.efforts.map(({ id }) => id),
    ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
  assert.equal(resolved.reasoning?.defaultEffort, 'high')
})

test('adapter translates pi streaming events and emits usage before finish', async () => {
  const adapter = new CodeBuddyAdapter(fakeModels())
  const chunks = []
  for await (const chunk of adapter.stream({
    provider: 'codebuddy',
    model: 'reasoner',
    reasoningEffort: ReasoningEffortId('medium'),
    messages: [],
  })) chunks.push(chunk)

  assert.deepEqual(chunks.map(({ type }) => type),
    ['block-start', 'text-delta', 'block-end', 'usage', 'finish'])
  assert.deepEqual(chunks.at(-2), {
    type: 'usage',
    usage: { inputTokens: 10, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 0, reasoningTokens: 1 },
  })
  assert.deepEqual(chunks.at(-1), { type: 'finish', reason: { kind: 'stop' } })
})

test('adapter rejects pi deferred-tool completions that DSH cannot consume', async () => {
  const adapter = new CodeBuddyAdapter(fakeModels('deferred'))

  await assert.rejects(async () => {
    for await (const _chunk of adapter.stream({
      provider: 'codebuddy',
      model: 'reasoner',
      reasoningEffort: ReasoningEffortId('medium'),
      messages: [],
    })) {
      // Drain the stream so the terminal event is observed.
    }
  }, /deferred tool response/)
})

function recordingModels() {
  const seen: { headers: Record<string, string>; payload?: unknown; sessionId?: string }[] = []
  const models = fakeModels()
  const base = models.streamSimple
  models.streamSimple = ((m: Model<'openai-completions'>, c: Context, options?: SimpleStreamOptions) => {
    seen.push({ headers: options?.headers as Record<string, string>, sessionId: options?.sessionId })
    seen.at(-1)!.payload = options?.onPayload?.({ model: 'reasoner' }, m)
    return base(m, c, options)
  }) as Models['streamSimple']
  return { models, seen }
}

async function drain(adapter: CodeBuddyAdapter, options: Partial<GenerateOptions> = {}) {
  for await (const _chunk of adapter.stream({ provider: 'codebuddy', model: 'reasoner', messages: [],
    reasoningEffort: ReasoningEffortId('medium'), ...options })) { /* drain */ }
}

const user = createMessage({ role: 'user', source: { kind: 'user' }, content: [{ type: 'text', text: 'hi' }] })
const assistant = createMessage({ role: 'assistant', source: { kind: 'model', provider: 'codebuddy', model: 'reasoner' },
  content: [{ type: 'tool-call', id: ToolCallId('c1'), name: 'read_file', arguments: '{}' }] })
const tool = createMessage({ role: 'tool', source: { kind: 'tool', callId: ToolCallId('c1') }, toolCallId: ToolCallId('c1'),
  content: [{ type: 'text', text: 'ok' }] })

test('adapter sends the CLI User-Agent, per-call context headers, and payload hooks', async () => {
  const { models, seen } = recordingModels()
  const adapter = new CodeBuddyAdapter(models, undefined, undefined, {
    requestContext: new RequestContextTracker({ enabled: true }),
    onPayload: (payload, sessionId) => ({ ...(payload as object), prompt_cache_key: sessionId }),
  })
  await drain(adapter, { sessionId: 'ses_1' as never, messages: [user] })
  await drain(adapter, { sessionId: 'ses_1' as never, messages: [user, assistant, tool] })
  assert.equal(seen.length, 2)
  const [first, second] = seen.map(({ headers }) => headers)
  assert.equal(first!['User-Agent'], 'CLI/2.168.2 CodeBuddy/2.168.2')
  assert.equal(first!['X-Conversation-ID'], conversationIdFor('ses_1'))
  assert.equal(second!['X-Conversation-Request-ID'], first!['X-Conversation-Request-ID'])
  assert.notEqual(second!['X-Request-ID'], first!['X-Request-ID'])
  for (const headers of [first!, second!]) {
    const names = Object.keys(headers).map(name => name.toLowerCase())
    assert.equal(new Set(names).size, names.length)
  }
  assert.deepEqual(seen[0]!.payload, { model: 'reasoner', prompt_cache_key: 'ses_1' })
})

test('adapter reports a finished compaction so the next main call carries X-Context-Compacted', async () => {
  const { models, seen } = recordingModels()
  const adapter = new CodeBuddyAdapter(models, undefined, undefined, { requestContext: new RequestContextTracker({ enabled: true }) })
  await drain(adapter, { sessionId: 'ses_1' as never, messages: [user] })
  await drain(adapter, { sessionId: 'ses_1' as never, messages: [user], purpose: 'compaction' })
  await drain(adapter, { sessionId: 'ses_1' as never, messages: [user] })
  assert.equal(seen[1]!.headers['X-Compaction'], 'manual')
  assert.equal(seen[2]!.headers['X-Context-Compacted'], 'manual')
})

test('adapter omits context headers when CLI headers are disabled', async () => {
  const { models, seen } = recordingModels()
  const adapter = new CodeBuddyAdapter(models, undefined, undefined, { requestContext: new RequestContextTracker({ enabled: false }) })
  await drain(adapter, { sessionId: 'ses_1' as never, messages: [user] })
  assert.deepEqual(seen[0]!.headers, { 'User-Agent': 'CLI/2.168.2 CodeBuddy/2.168.2' })
})
