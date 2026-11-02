/** Immutable input snapshots. The Adapter commits the input and metadata together. */
import { createHash } from 'node:crypto'
import { z } from 'zod'
import {
  cardPathSchema, sessionIdSchema, jsonValueSchema, utf8Bytes,
  MODEL_STATE_MAX_BYTES, MODEL_STATE_MAX_ITEMS, STATE_MAX_BYTES, PROMPT_MAX_BYTES,
  type JsonValue, type StoredWidgetState,
} from './bridge-contract.ts'

export interface ModelContextEntry { path: string; state: JsonValue }
export interface Submission { submissionId: string; path: string; intent: string; modelContent: JsonValue }
export interface InputRecord {
  session: string
  submissionId: string
  inputId: string
  fingerprint: string
  intent: string
  context: ModelContextEntry[]
}
export interface AdmissionReceipt { submissionId: string; inputId: string }
export interface InputAdapter {
  /** Must query durable input identity, including pending and executed input. */
  find(session: string, submissionId: string): Promise<InputRecord | null>
  /** Atomically deduplicate by session/submissionId, reject conflicting content, and flush. */
  append(record: InputRecord): Promise<void>
}
export class AdmissionError extends Error {
  constructor(readonly code: 'invalid-params' | 'id-conflict' | 'outcome-unknown', message: string) { super(message) }
}
const submissionSchema = z.object({
  submissionId: z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/),
  path: cardPathSchema,
  intent: z.string().trim().min(1).refine(s => utf8Bytes(s) <= PROMPT_MAX_BYTES),
  modelContent: jsonValueSchema,
}).strict()
const contextSchema = z.array(z.object({ path: cardPathSchema, state: jsonValueSchema }).strict()).max(MODEL_STATE_MAX_ITEMS)

/** Stable JSON identity independent of caller property insertion order. */
function canonical(value: JsonValue): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']'
  if (value !== null && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k]!)).join(',') + '}'
  return JSON.stringify(value)
}
function validateContext(value: unknown): ModelContextEntry[] {
  const parsed = contextSchema.safeParse(value)
  if (!parsed.success || utf8Bytes(JSON.stringify(parsed.data)) > MODEL_STATE_MAX_BYTES) throw new AdmissionError('invalid-params', 'Invalid or oversized widget input context')
  if (new Set(parsed.data.map(r => r.path)).size !== parsed.data.length) throw new AdmissionError('invalid-params', 'Duplicate widget paths')
  for (const row of parsed.data) if (utf8Bytes(JSON.stringify(row.state)) > STATE_MAX_BYTES) throw new AdmissionError('invalid-params', 'Oversized widget state')
  return JSON.parse(JSON.stringify(parsed.data)) as ModelContextEntry[]
}
/** Positive projection: never serialize the stored privateContent object. */
export function captureContext(rows: readonly StoredWidgetState[], override?: Pick<Submission, 'path' | 'modelContent'>): ModelContextEntry[] {
  const entries = rows.filter(r => r.state.modelContent !== null && r.path !== override?.path)
    .map(r => ({ path: r.path, state: r.state.modelContent }))
  if (override !== undefined) entries.push({ path: override.path, state: override.modelContent })
  return validateContext(entries.sort((a, b) => a.path.localeCompare(b.path)))
}
/** Read only versioned metadata; missing metadata is distinct from an empty snapshot. */
export function contextFromSource(source: unknown): ModelContextEntry[] | null {
  if (source === null || typeof source !== 'object' || !('dshWidget' in source)) return null
  const raw = source.dshWidget
  if (raw === null || typeof raw !== 'object' || !('version' in raw) || raw.version !== 1 || !('context' in raw)) throw new AdmissionError('invalid-params', 'Invalid widget source metadata')
  return validateContext(raw.context)
}

/** Public admission seam. Capture happens synchronously before lookup or queue waits. */
export function interactionAdmission(adapter: InputAdapter, states: (session: string) => readonly StoredWidgetState[]) {
  const queues = new Map<string, Promise<unknown>>()
  return {
    async submit(session: string, value: unknown): Promise<AdmissionReceipt> {
      const parsed = submissionSchema.safeParse(value)
      if (!sessionIdSchema.safeParse(session).success || !parsed.success) throw new AdmissionError('invalid-params', 'Invalid widget submission')
      const submission = parsed.data
      const context = captureContext(states(session), submission)
      const fingerprint = createHash('sha256').update(canonical(submission as unknown as JsonValue)).digest('hex')
      const inputId = 'widget-' + createHash('sha256').update(JSON.stringify([session, submission.submissionId])).digest('hex')
      const record: InputRecord = { session, submissionId: submission.submissionId, inputId, fingerprint, intent: submission.intent, context }
      const previous = queues.get(session) ?? Promise.resolve()
      const operation = previous.catch(() => {}).then(async () => {
        const found = await adapter.find(session, submission.submissionId)
        if (found !== null) {
          if (found.fingerprint !== fingerprint) throw new AdmissionError('id-conflict', 'Submission ID already belongs to different content')
          return { submissionId: found.submissionId, inputId: found.inputId }
        }
        try { await adapter.append(record) }
        catch { throw new AdmissionError('outcome-unknown', 'Input admission outcome is unknown; look up this submission before retrying') }
        return { submissionId: record.submissionId, inputId: record.inputId }
      })
      queues.set(session, operation)
      try { return await operation }
      finally { if (queues.get(session) === operation) queues.delete(session) }
    },
    async lookup(session: string, submissionId: string): Promise<AdmissionReceipt | null> {
      const record = await adapter.find(session, submissionId)
      return record === null ? null : { submissionId: record.submissionId, inputId: record.inputId }
    },
  }
}
