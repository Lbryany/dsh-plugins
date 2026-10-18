import assert from 'node:assert/strict'
import test from 'node:test'

import { conversationIdFor } from '../src/codebuddy.ts'
import {
  mergeHeaders,
  normalizeAgentRuntime,
  requestContextHeaders,
  RequestContextTracker,
  sourceRole,
  type CallMessage,
  type ModelCallInput,
} from '../src/request-context.ts'

const user = { role: 'user' }
const assistant = { role: 'assistant' }
const tool = { role: 'tool' }
const system = { role: 'system' }

function headersOf(tracker: RequestContextTracker, call: ModelCallInput): Record<string, string> {
  const context = tracker.begin(call)
  assert.ok(context)
  return requestContextHeaders(context)
}

test('agent runtime normalizes like the CLI', () => {
  assert.equal(normalizeAgentRuntime(undefined), undefined)
  assert.equal(normalizeAgentRuntime('   '), undefined)
  assert.equal(normalizeAgentRuntime(' local-agent '), 'local-agent')
  assert.equal(normalizeAgentRuntime('LOCAL-AGENT'), 'other')
  assert.equal(normalizeAgentRuntime('unexpected'), 'other')
  const headers = (runtime: string | undefined) => headersOf(new RequestContextTracker({ enabled: true, runtime: () => runtime }),
    { messages: [user] })['X-Agent-Runtime']
  assert.equal(headers(undefined), 'other')
  assert.equal(headers(' cloud-agent '), 'cloud-agent')
})

test('tool follow-ups reuse the turn and a new user message starts the next one', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const calls = [[system, user], [system, user, assistant, tool], [system, user, assistant, tool, assistant, tool]]
    .map(messages => headersOf(tracker, { sessionId: 'ses_1', messages }))
  for (const headers of calls) {
    assert.equal(headers['X-Conversation-ID'], conversationIdFor('ses_1'))
    assert.equal(headers['X-Request-ID'], headers['X-Conversation-Message-ID'])
    assert.match(headers['X-Request-ID']!, /^[0-9a-f]{32}$/)
    assert.equal(headers['X-Root-Request-ID'], calls[0]!['X-Conversation-Request-ID'])
    assert.equal(headers['X-Agent-Type'], 'main')
    assert.equal(headers['X-Agent-Purpose'], 'conversation')
  }
  for (const name of ['X-Conversation-Request-ID', 'X-Trace-ID']) {
    assert.equal(new Set(calls.map(headers => headers[name])).size, 1, name)
  }
  for (const name of ['X-Request-ID', 'X-B3-SpanId']) {
    assert.equal(new Set(calls.map(headers => headers[name])).size, 3, name)
  }
  assert.match(calls[0]!['X-Conversation-Request-ID']!, /^[0-9a-f]{32}$/)

  const next = headersOf(tracker, { sessionId: 'ses_1', messages: [system, user, assistant, tool, assistant, user] })
  assert.equal(next['X-Conversation-ID'], calls[0]!['X-Conversation-ID'])
  assert.notEqual(next['X-Conversation-Request-ID'], calls[0]!['X-Conversation-Request-ID'])
  assert.equal(next['X-Root-Request-ID'], next['X-Conversation-Request-ID'])
  assert.notEqual(next['X-Trace-ID'], calls[0]!['X-Trace-ID'])
})

const from = (role: string, kind: string, extra: Record<string, unknown> = {}) => ({ role, source: { kind, ...extra } })

test('turns follow message sources: only real user input starts one', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const request = (messages: CallMessage[]) => headersOf(tracker, { sessionId: 'ses_1', messages })['X-Conversation-Request-ID']
  const history: CallMessage[] = [from('system', 'system-prompt'), user, from('user', 'runtime-context')]
  const first = request(history)
  history.push(from('assistant', 'model'), from('tool', 'tool'))
  assert.equal(request(history), first)
  history.push(from('assistant', 'model'), from('user', 'subagent-settled'))
  assert.equal(request(history), first)
  history.push(from('assistant', 'model'), from('user', 'agent-message'))
  assert.equal(request(history), first)
  history.push(from('assistant', 'model'), from('user', 'some-future-kind'))
  assert.equal(request(history), first)
  for (const kind of ['team-message', 'goal', 'user-question-reply', 'working-directory', 'skill-invocation']) {
    assert.equal(request([...history, from('assistant', 'model'), from('user', kind)]), first, kind)
  }

  history.push(from('assistant', 'model'), from('user', 'user'))
  const second = request(history)
  assert.notEqual(second, first)
  history.push(from('assistant', 'model'), from('user', 'user'), from('user', 'model-selection'))
  const third = request(history)
  assert.notEqual(third, second)
  history.push(from('assistant', 'model'), from('user', 'schedule'))
  const fourth = request(history)
  assert.notEqual(fourth, third)
  history.push(from('assistant', 'model'), from('user', 'webhook'))
  assert.notEqual(request(history), fourth)
})

test('source roles classify system, developer, unsourced, and unknown messages', () => {
  assert.equal(sourceRole({ role: 'user' }), 'input')
  assert.equal(sourceRole({ role: 'assistant' }), 'model')
  assert.equal(sourceRole({ role: 'tool' }), 'context')
  assert.equal(sourceRole(from('system', 'user')), 'context')
  assert.equal(sourceRole(from('developer', 'user')), 'context')
  assert.equal(sourceRole(from('user', 'brand-new-kind')), 'context')
  // 只有上下文注入时开新 turn
  const tracker = new RequestContextTracker({ enabled: true })
  const a = headersOf(tracker, { sessionId: 's', messages: [user] })
  const b = headersOf(tracker, { sessionId: 's', messages: [from('user', 'runtime-context')] })
  assert.notEqual(b['X-Conversation-Request-ID'], a['X-Conversation-Request-ID'])
})

test('a tool follow-up without a known turn starts a new one', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const first = headersOf(tracker, { sessionId: 'ses_1', messages: [user, assistant, tool] })
  assert.equal(first['X-Root-Request-ID'], first['X-Conversation-Request-ID'])
  const second = headersOf(tracker, { sessionId: 'ses_1', messages: [user, assistant, tool, assistant, tool] })
  assert.equal(second['X-Conversation-Request-ID'], first['X-Conversation-Request-ID'])
})

test('parent and sub-agent sessions keep independent turns', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const parent1 = headersOf(tracker, { sessionId: 'parent', messages: [user] })
  const child1 = headersOf(tracker, { sessionId: 'child', messages: [user] })
  const parent2 = headersOf(tracker, { sessionId: 'parent', messages: [user, assistant, tool] })
  const child2 = headersOf(tracker, { sessionId: 'child', messages: [user, assistant, tool] })
  const child3 = headersOf(tracker, { sessionId: 'child', messages: [user, assistant, tool, assistant, user] })
  const parent3 = headersOf(tracker, { sessionId: 'parent', messages: [user, assistant, tool, assistant, tool] })
  assert.notEqual(parent1['X-Conversation-ID'], child1['X-Conversation-ID'])
  assert.notEqual(parent1['X-Conversation-Request-ID'], child1['X-Conversation-Request-ID'])
  assert.notEqual(parent1['X-Trace-ID'], child1['X-Trace-ID'])
  for (const headers of [parent2, parent3]) {
    assert.equal(headers['X-Conversation-Request-ID'], parent1['X-Conversation-Request-ID'])
    assert.equal(headers['X-Trace-ID'], parent1['X-Trace-ID'])
  }
  assert.equal(child2['X-Conversation-Request-ID'], child1['X-Conversation-Request-ID'])
  assert.notEqual(child3['X-Conversation-Request-ID'], child1['X-Conversation-Request-ID'])
})

test('compaction reuses the turn and flags only the next main call', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const main = headersOf(tracker, { sessionId: 'ses_1', messages: [user] })
  const context = tracker.begin({ sessionId: 'ses_1', purpose: 'compaction', messages: [user] })!
  const compaction = requestContextHeaders(context)
  assert.equal(compaction['X-Agent-Type'], 'compaction')
  assert.equal(compaction['X-Agent-Purpose'], 'context_compact')
  assert.equal(compaction['X-Compaction'], 'manual')
  assert.equal(compaction['X-Context-Compacted'], undefined)
  assert.equal(compaction['X-Conversation-Request-ID'], main['X-Conversation-Request-ID'])
  assert.equal(compaction['X-Trace-ID'], main['X-Trace-ID'])
  assert.notEqual(compaction['X-Request-ID'], main['X-Request-ID'])
  tracker.complete(context)

  const after = headersOf(tracker, { sessionId: 'ses_1', messages: [user] })
  assert.equal(after['X-Context-Compacted'], 'manual')
  assert.equal(after['X-Compaction'], undefined)
  const later = headersOf(tracker, { sessionId: 'ses_1', messages: [user, assistant, tool] })
  assert.equal(later['X-Context-Compacted'], undefined)
})

test('X-Context-Compacted reports auto unless the checkpoint came from a command', () => {
  const run = (checkpoint: CallMessage) => {
    const tracker = new RequestContextTracker({ enabled: true })
    headersOf(tracker, { sessionId: 'ses_1', messages: [user] })
    tracker.complete(tracker.begin({ sessionId: 'ses_1', purpose: 'compaction', messages: [user] })!)
    return headersOf(tracker, { sessionId: 'ses_1', messages: [from('system', 'system-prompt'), checkpoint, user] })
  }
  assert.equal(run(from('user', 'compact-checkpoint', { compactionId: 'c1' }))['X-Context-Compacted'], 'auto')
  assert.equal(run(from('user', 'compact-checkpoint', { compactionId: 'c1', sourceCommandId: 'cmd' }))['X-Context-Compacted'], 'manual')
})

test('an unfinished compaction does not flag the next main call', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  headersOf(tracker, { sessionId: 'ses_1', messages: [user] })
  headersOf(tracker, { sessionId: 'ses_1', purpose: 'compaction', messages: [user] })
  assert.equal(headersOf(tracker, { sessionId: 'ses_1', messages: [user] })['X-Context-Compacted'], undefined)
})

test('session titles get an independent identity linked only by the root', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const main = headersOf(tracker, { sessionId: 'ses_1', messages: [user] })
  const titles = [1, 2].map(() => headersOf(tracker, { sessionId: 'ses_1', purpose: 'session-title', messages: [user] }))
  for (const title of titles) {
    assert.equal(title['X-Agent-Type'], 'auxiliary')
    assert.equal(title['X-Agent-Purpose'], 'conversation_topic')
    assert.match(title['X-Conversation-ID']!, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    assert.notEqual(title['X-Conversation-ID'], main['X-Conversation-ID'])
    assert.notEqual(title['X-Conversation-Request-ID'], main['X-Conversation-Request-ID'])
    assert.equal(title['X-Root-Request-ID'], main['X-Root-Request-ID'])
    assert.notEqual(title['X-Trace-ID'], main['X-Trace-ID'])
    assert.equal(title.baggage, `codebuddy.session_id=${title['X-Conversation-ID']},`
      + `codebuddy.conversation_request_id=${title['X-Conversation-Request-ID']}`)
    assert.equal(title['X-Parent-Conversation-ID'], undefined)
  }
  assert.notEqual(titles[0]!['X-Conversation-ID'], titles[1]!['X-Conversation-ID'])
  const followUp = headersOf(tracker, { sessionId: 'ses_1', messages: [user, assistant, tool] })
  assert.equal(followUp['X-Conversation-Request-ID'], main['X-Conversation-Request-ID'])
  assert.equal(followUp['X-Trace-ID'], main['X-Trace-ID'])

  // 没有当前 turn 时 root 就是自己的 run id，且不登记
  const fresh = new RequestContextTracker({ enabled: true })
  const orphan = headersOf(fresh, { sessionId: 'ses_2', purpose: 'session-title', messages: [user] })
  assert.equal(orphan['X-Root-Request-ID'], orphan['X-Conversation-Request-ID'])
  const toolCall = headersOf(fresh, { sessionId: 'ses_2', messages: [user, assistant, tool] })
  assert.notEqual(toolCall['X-Conversation-Request-ID'], orphan['X-Conversation-Request-ID'])
})

test('calls without a session get a hyphenated conversation id and an unregistered run', () => {
  const tracker = new RequestContextTracker({ enabled: true })
  const first = headersOf(tracker, { messages: [user] })
  const second = headersOf(tracker, { messages: [user, assistant, tool] })
  assert.match(first['X-Conversation-ID']!, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  assert.equal(first['X-Root-Request-ID'], first['X-Conversation-Request-ID'])
  assert.notEqual(second['X-Conversation-ID'], first['X-Conversation-ID'])
  assert.notEqual(second['X-Conversation-Request-ID'], first['X-Conversation-Request-ID'])
})

test('trace headers follow W3C and B3 single-span formats', () => {
  const headers = headersOf(new RequestContextTracker({ enabled: true }), { sessionId: 'ses_1', messages: [user] })
  const match = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/.exec(headers.traceparent!)
  assert.ok(match)
  const [, traceId, spanId] = match
  assert.notEqual(traceId, '0'.repeat(32))
  assert.notEqual(spanId, '0'.repeat(16))
  assert.equal(headers.b3, `${traceId}-${spanId}-1`)
  assert.equal(headers['X-B3-TraceId'], traceId)
  assert.equal(headers['X-B3-SpanId'], spanId)
  assert.equal(headers['X-B3-Sampled'], '1')
  assert.equal(headers['X-Trace-ID'], traceId)
  assert.equal(Object.keys(headers).some(name => name.toLowerCase() === 'x-b3-parentspanid'), false)

  const zero = new RequestContextTracker({ enabled: true, randomHex: bytes => '0'.repeat(bytes * 2) })
  const forced = headersOf(zero, { messages: [user] })
  assert.match(forced.traceparent!, /^00-0{31}1-0{15}1-01$/)
})

test('baggage carries the session and conversation request ids', () => {
  const headers = headersOf(new RequestContextTracker({ enabled: true }), { sessionId: 'ses_1', messages: [user] })
  assert.equal(headers.baggage, `codebuddy.session_id=${headers['X-Conversation-ID']},`
    + `codebuddy.conversation_request_id=${headers['X-Conversation-Request-ID']}`)
  const context = new RequestContextTracker({ enabled: true, uuid: () => 'a b,c' }).begin({ messages: [user] })!
  assert.equal(requestContextHeaders(context).baggage,
    'codebuddy.session_id=a%20b%2Cc,codebuddy.conversation_request_id=a%20b%2Cc')
})

test('snapshots are frozen and disabled trackers produce no context', () => {
  const context = new RequestContextTracker({ enabled: true }).begin({ sessionId: 'ses_1', messages: [user] })!
  assert.equal(Object.isFrozen(context), true)
  assert.equal(new RequestContextTracker({ enabled: false }).begin({ sessionId: 'ses_1', messages: [user] }), undefined)
})

test('the session table is bounded and evicts the least recently used session', () => {
  const tracker = new RequestContextTracker({ enabled: true, maxSessions: 2 })
  const a = headersOf(tracker, { sessionId: 'a', messages: [user] })
  const b = headersOf(tracker, { sessionId: 'b', messages: [user] })
  headersOf(tracker, { sessionId: 'a', messages: [user, assistant, tool] })
  headersOf(tracker, { sessionId: 'c', messages: [user] })
  // b 最久未用被淘汰，a 仍保留当前 turn
  assert.equal(headersOf(tracker, { sessionId: 'a', messages: [user, assistant, tool] })['X-Conversation-Request-ID'],
    a['X-Conversation-Request-ID'])
  assert.notEqual(headersOf(tracker, { sessionId: 'b', messages: [user, assistant, tool] })['X-Conversation-Request-ID'],
    b['X-Conversation-Request-ID'])
})

test('mergeHeaders keeps one value per header regardless of case', () => {
  assert.deepEqual(mergeHeaders(
    { 'x-request-id': 'old', 'User-Agent': 'a' },
    undefined,
    { 'X-Request-ID': 'new', 'user-agent': 'b' },
  ), { 'X-Request-ID': 'new', 'user-agent': 'b' })
})
