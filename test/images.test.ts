import assert from 'node:assert/strict'
import test from 'node:test'
import { createAssistantMessageEventStream, type AssistantMessage, type Context, type Model, type Models, type SimpleStreamOptions } from '@earendil-works/pi-ai'
import { CodeBuddyAdapter } from '../src/adapter.ts'
import { createImageReader, fitLongEdge, type ImageReader } from '../src/images.ts'

const vision: Model<'openai-completions'> = {
  id: 'v', name: 'Vision', api: 'openai-completions', provider: 'codebuddy', baseUrl: 'https://example.test/v2',
  reasoning: false, input: ['text', 'image'], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000, maxTokens: 100,
}
const textOnly: Model<'openai-completions'> = { ...vision, id: 't', name: 'Text', input: ['text'] }

function message(): AssistantMessage {
  return { role: 'assistant', content: [{ type: 'text', text: 'ok' }], api: 'openai-completions', provider: 'codebuddy', model: 'v',
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'stop', timestamp: Date.now() }
}

function fakeModels(onContext: (context: Context) => void): Models {
  return {
    refresh: async () => ({ aborted: false, errors: new Map() }),
    getModels: () => [vision, textOnly],
    getModel: (_p: string, id: string) => [vision, textOnly].find(m => m.id === id),
    streamSimple: (_m: Model<'openai-completions'>, context: Context, _o?: SimpleStreamOptions) => {
      onContext(context)
      const stream = createAssistantMessageEventStream()
      const m = message()
      queueMicrotask(() => { stream.push({ type: 'start', partial: m }); stream.push({ type: 'done', reason: 'stop', message: m }); stream.end(m) })
      return stream
    },
  } as unknown as Models
}

const ref = { attachmentId: 'att_1', mediaType: 'image/png', bytes: 3, width: 4000, height: 1000, name: 'shot.png' }
const reader: ImageReader = { available: () => true, read: async (r) => ({ data: new Uint8Array([1, 2, 3]), mediaType: r.mediaType }) }

test('vision models advertise image input only when a reader is available', async () => {
  const withReader = new CodeBuddyAdapter(fakeModels(() => {}), undefined, undefined, { images: reader })
  const listed = await withReader.listModels('codebuddy')
  assert.deepEqual(listed.map(m => m.inputModalities), [['text', 'image'], ['text']])
  const unavailable = new CodeBuddyAdapter(fakeModels(() => {}), undefined, undefined, { images: { ...reader, available: () => false } })
  assert.deepEqual((await unavailable.listModels('codebuddy')).map(m => m.inputModalities), [['text'], ['text']])
  const none = new CodeBuddyAdapter(fakeModels(() => {}))
  assert.deepEqual((await none.resolveModel('codebuddy', 'v')).inputModalities, ['text'])
})

test('user and tool image blocks become inline base64 parts for a vision model', async () => {
  let seen: Context | undefined
  const adapter = new CodeBuddyAdapter(fakeModels(c => { seen = c }), undefined, undefined, { images: reader })
  const chunks = []
  for await (const chunk of adapter.stream({
    model: 'v',
    messages: [
      { role: 'user', content: [{ type: 'text', text: '看图' }, { type: 'image', attachment: ref }] },
      { role: 'assistant', content: [{ type: 'tool-call', id: 'c1', name: 'shot', arguments: '{}' }] },
      { role: 'tool', toolCallId: 'c1', content: [{ type: 'image', attachment: ref }] },
      { role: 'user', content: [{ type: 'image', attachment: { ...ref, attachmentId: 'att_2' }, offloaded: true }, { type: 'text', text: '再看' }] },
    ],
  } as never)) chunks.push(chunk.type)
  assert.ok(chunks.includes('finish'))
  const [user, , tool, offloaded] = seen!.messages
  assert.deepEqual(user, { ...user, content: [{ type: 'text', text: '看图' }, { type: 'image', data: 'AQID', mimeType: 'image/png' }] })
  assert.equal(tool?.role, 'toolResult')
  assert.deepEqual((tool as { content: unknown }).content, [{ type: 'image', data: 'AQID', mimeType: 'image/png' }])
  assert.equal(typeof (offloaded as { content: unknown }).content, 'string')
  assert.match((offloaded as { content: string }).content, /shot\.png|att_2/)
  assert.match((offloaded as { content: string }).content, /再看/)
})

test('text-only models never receive image bytes', async () => {
  let seen: Context | undefined
  const adapter = new CodeBuddyAdapter(fakeModels(c => { seen = c }), undefined, undefined, { images: reader })
  for await (const _ of adapter.stream({ model: 't', messages: [{ role: 'user', content: [{ type: 'text', text: 'x' }, { type: 'image', attachment: ref }] }] } as never)) { /* drain */ }
  const [user] = seen!.messages
  assert.equal(typeof (user as { content: unknown }).content, 'string')
  assert.doesNotMatch((user as { content: string }).content, /AQID/)
})

test('image reader fits the long edge and asks the attachment service for that version', async () => {
  assert.deepEqual(fitLongEdge(4000, 1000, 2048), { width: 2048, height: 512 })
  assert.deepEqual(fitLongEdge(100, 50, 2048), { width: 100, height: 50 })
  const calls: unknown[] = []
  const store = { readImageRequest: async (r: unknown, target: unknown) => { calls.push([r, target]); return { data: new Uint8Array([9]), mediaType: 'image/jpeg' } } }
  const r = createImageReader(() => store as never)
  assert.equal(r.available(), true)
  assert.deepEqual(await r.read(ref as never), { data: new Uint8Array([9]), mediaType: 'image/jpeg' })
  assert.deepEqual(calls[0], [ref, { width: 2048, height: 512, maxBytes: 4 * 1024 * 1024 }])
  assert.equal(createImageReader(() => undefined).available(), false)
})
