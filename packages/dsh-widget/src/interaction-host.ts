/** Atomic user-message admission with public widget data and durable source metadata. */
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import {
  captureContext, contextFromSource, interactionAdmission,
  type InputRecord, type ModelContextEntry,
} from './interaction-admission.ts'
import type { StateStore } from './state-store.ts'
import { MODEL_STATE_OPEN, MODEL_STATE_CLOSE, MODEL_STATE_NOTE } from './state-store.ts'
import { sessionIdSchema } from './bridge-contract.ts'

export const INTERACTION_PATH = '/api/dsh-widget/interaction'
const KEY = 'dsh-widget.inputs'
interface AgentView { id: string; session: object }
interface ProjectionState { receipts: Record<string, InputRecord>; latest: ModelContextEntry[] }
interface EventView { type: string; data: { source?: unknown; inserted?: { source: unknown }[] } }
interface ProjectionRegistry {
  register(definition: unknown): () => void
  stateOf(session: object, key: string): ProjectionState | undefined
}
interface CapturedMessage { content: unknown[]; source: object }
interface Controller {
  registerWidgetInputCaptureV2?: (capture: (agent: AgentView, request: { requestId: string }, message: CapturedMessage) => CapturedMessage) => () => void
  resolveAgent(id: string): Promise<{ agent: AgentView } | { error: unknown }>
  prompt(request: { sessionId: string; requestId: string; mode: 'queue'; content: { type: 'text'; text: string }[] }, signal: AbortSignal): Promise<unknown>
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })

/** Fold committed metadata; pending and executed inputs have the same durable receipt. */
export function foldWidgetInput(previous: ProjectionState, event: EventView): ProjectionState {
  const sources = event.type === 'agent/inbox/spliced' ? (event.data.inserted ?? []).map(m => m.source)
    : event.type === 'user/message' ? [event.data.source] : []
  let state = previous
  for (const source of sources) {
    const context = contextFromSource(source)
    if (context === null) continue
    const data = (source as { dshWidget: { record?: InputRecord } }).dshWidget
    state = {
      receipts: data.record === undefined ? state.receipts : { ...state.receipts, [data.record.submissionId]: data.record },
      latest: event.type === 'user/message' ? context : state.latest,
    }
  }
  return state
}

/** Append snapshots at admission, never by rewriting system prompts or old inputs. */
export function registerInteractionHost(ctx: Context, store: () => StateStore | undefined): void {
  let projections: ProjectionRegistry | undefined
  const staged = new Map<string, InputRecord>()
  ctx.inject(['sessionController', 'sessionProjections', 'connection'], scope => {
    const controller = scope.get('sessionController') as Controller
    if (typeof controller.registerWidgetInputCaptureV2 !== 'function') return
    projections = scope.get('sessionProjections') as ProjectionRegistry
    scope.effect(() => projections!.register({
      key: KEY, stateVersion: 1,
      stateSchema: z.object({ receipts: z.record(z.unknown()), latest: z.array(z.unknown()) }),
      init: () => ({ receipts: {}, latest: [] }), apply: foldWidgetInput,
    }), 'dsh-widget: input projection')
    const capture = (agent: AgentView, request: { requestId: string }, message: CapturedMessage): CapturedMessage => {
      const record = staged.get(JSON.stringify([agent.id, request.requestId]))
      const context = record?.context ?? captureContext(store()?.listSync(agent.id) ?? [])
      // Serialize the validated snapshot without dropping null or truncating entries.
      // Escape '<' so field values cannot terminate the untrusted-data boundary.
      const text = `${MODEL_STATE_OPEN}\n${JSON.stringify(context).replaceAll('<', '\\u003c')}\n${MODEL_STATE_CLOSE}\n${MODEL_STATE_NOTE}`
      return {
        content: [...message.content, { type: 'text', text }],
        source: { ...message.source, dshWidget: { version: 1, context, ...(record === undefined ? {} : { record }) } },
      }
    }
    scope.effect(() => controller.registerWidgetInputCaptureV2!(capture), 'dsh-widget: input capture')
    const resolve = async (id: string) => {
      const found = await controller.resolveAgent(id)
      if ('error' in found) throw new Error('Session unavailable')
      return found.agent
    }
    const service = interactionAdmission({
      async find(session, submissionId) {
        const agent = await resolve(session)
        const inherited = projections!.stateOf(agent.session, KEY)?.receipts[submissionId]
        // Fork replay contains parent metadata; receipts belong to the original session.
        const receipt = inherited?.session === session ? inherited : null
        if (receipt !== null) {
          const sessions = scope.get('sessions') as { flush(session: object): Promise<boolean> }
          if (!await sessions.flush(agent.session)) throw new Error('Durable input storage unavailable')
        }
        return receipt
      },
      async append(record) {
        const key = JSON.stringify([record.session, record.inputId])
        staged.set(key, record)
        try {
          await controller.prompt({ sessionId: record.session, requestId: record.inputId, mode: 'queue', content: [{ type: 'text', text: record.intent }] }, new AbortController().signal)
        } finally { staged.delete(key) }
      },
    }, session => store()?.listSync(session) ?? [])
    const fetch = (scope.get('connection') as { fetch: { register(route: unknown): () => void } }).fetch
    scope.effect(() => fetch.register({ path: INTERACTION_PATH, methods: ['GET', 'POST'], requestBody: 'buffered', fetch: async (request: Request) => {
      const url = new URL(request.url)
      if (request.method === 'GET' && !url.searchParams.has('submissionId')) return json(200, { supported: true })
      try {
        if (request.method === 'GET') {
          const session = sessionIdSchema.parse(url.searchParams.get('session'))
          return json(200, { receipt: await service.lookup(session, url.searchParams.get('submissionId')!) })
        }
        const text = await request.text()
        if (new TextEncoder().encode(text).length > 96 * 1024) return json(413, { error: 'invalid-params' })
        const body = JSON.parse(text) as { session: string; submission: unknown }
        return json(200, { receipt: await service.submit(body.session, body.submission) })
      } catch (error) {
        return json(400, { error: error !== null && typeof error === 'object' && 'code' in error ? error.code : 'failed', message: error instanceof Error ? error.message : 'Invalid submission' })
      }
    } }), 'dsh-widget: interaction route')
  })
}
