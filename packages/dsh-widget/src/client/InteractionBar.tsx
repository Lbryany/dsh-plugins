/** Host-owned capture, preview and submission UI. Never sends a text-only fallback. */
import { useEffect, useRef, useState, type RefObject } from 'react'
import { jsonValueSchema, utf8Bytes, STATE_MAX_BYTES, type InteractionAction, type JsonValue } from '../bridge-contract.ts'
import { CHOICE_CSS, INTERACTION_CSS } from '../choice-css.ts'

const PATH = '/api/dsh-widget/interaction'
interface Selection { submissionId: string; path: string; intent: string; modelContent: JsonValue }
class RequestError extends Error {
  constructor(readonly code: string | undefined, message: string) { super(message) }
}
export function captureInteraction(frame: HTMLIFrameElement, token: string, epoch: string, signal: AbortSignal): Promise<JsonValue> {
  const source = frame.contentWindow
  const captureId = crypto.randomUUID()
  return new Promise((resolve, reject) => {
    const finish = (error?: Error, value?: JsonValue) => {
      clearTimeout(timer)
      window.removeEventListener('message', receive)
      signal.removeEventListener('abort', cancel)
      if (error) reject(error); else resolve(value!)
    }
    const cancel = () => finish(new Error('页面已关闭，请重新选择'))
    const receive = (event: MessageEvent) => {
      const data = event.data
      if (event.source !== source || source !== frame.contentWindow || !data || data.type !== 'dsh-widget:captured' || data.token !== token || data.epoch !== epoch || data.captureId !== captureId) return
      if (data.error) { finish(new Error(String(data.error))); return }
      const parsed = jsonValueSchema.safeParse(data.modelContent)
      if (!parsed.success || utf8Bytes(JSON.stringify(parsed.data)) > STATE_MAX_BYTES) finish(new Error('选择无效或过大'))
      else finish(undefined, parsed.data)
    }
    const timer = setTimeout(() => finish(new Error('读取选择超时，请重试')), 5000)
    window.addEventListener('message', receive)
    signal.addEventListener('abort', cancel, { once: true })
    if (signal.aborted || source === null) { cancel(); return }
    source.postMessage({ type: 'dsh-widget:capture', token, epoch, captureId }, '*')
  })
}
async function request(method: 'GET' | 'POST', session: string, selection?: Selection | { submissionId: string }) {
  const url = new URL(PATH.slice(1), document.baseURI)
  url.searchParams.set('session', session)
  if (method === 'GET' && selection) url.searchParams.set('submissionId', selection.submissionId)
  const response = await fetch(url, {
    method, credentials: 'same-origin', headers: { 'content-type': 'application/json' },
    ...(method === 'POST' ? { body: JSON.stringify({ session, submission: selection }) } : {}),
    signal: AbortSignal.timeout(30000),
  })
  const data = await response.json() as { supported?: boolean; receipt?: { inputId: string }; message?: string; error?: string }
  if (!response.ok) throw new RequestError(data.error, data.message ?? '交互提交暂不可用')
  return data
}
export async function supportsInteraction(session: string): Promise<boolean> {
  try { return (await request('GET', session)).supported === true } catch { return false }
}

type InteractionProps = {
  action: InteractionAction; session: string; path: string; token: string; epoch: string; frame: RefObject<HTMLIFrameElement>
}
export function InteractionBar(props: InteractionProps) {
  return <InteractionBarState key={JSON.stringify([props.session, props.path, props.epoch])} {...props} />
}
function InteractionBarState({ action, session, path, token, epoch, frame }: InteractionProps) {
  const [preview, setPreview] = useState<Selection | null>(null)
  const [status, setStatus] = useState('')
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const primaryButton = useRef<HTMLButtonElement>(null)
  const confirmButton = useRef<HTMLButtonElement>(null)
  useEffect(() => { if (preview) confirmButton.current?.focus() }, [preview])
  const storageKey = 'dsh-widget:pending:' + JSON.stringify([session, path])
  const unresolved = useRef<{ submissionId: string; selection?: Selection } | null>(null)
  const [retryAllowed, setRetryAllowed] = useState(false)
  const initialized = useRef(false)
  if (!initialized.current) {
    initialized.current = true
    try {
      const raw = sessionStorage.getItem(storageKey)
      if (raw && /^[a-zA-Z0-9_-]{1,128}$/.test(raw)) unresolved.current = { submissionId: raw } // v1 recovery ID
      else if (raw) {
        const saved = JSON.parse(raw) as { version?: number; selection?: Selection }
        const selected = saved.selection
        if (saved.version === 2 && selected && selected.path === path && typeof selected.intent === 'string'
          && /^[a-zA-Z0-9_-]{1,128}$/.test(selected.submissionId) && jsonValueSchema.safeParse(selected.modelContent).success
          && utf8Bytes(JSON.stringify(selected.modelContent)) <= STATE_MAX_BYTES) unresolved.current = { submissionId: selected.submissionId, selection: selected }
      }
    } catch { /* Persistence is required before sending below. */ }
  }
  const clearPending = () => { sessionStorage.removeItem(storageKey); unresolved.current = null }
  const lifetime = useRef(new AbortController())
  useEffect(() => {
    const controller = new AbortController()
    lifetime.current = controller
    return () => controller.abort()
  }, [])
  const capture = async () => {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try {
      if (unresolved.current) {
        if (retryAllowed && unresolved.current.selection) {
          // User retries the same immutable command; the admission layer deduplicates it.
          await sendSelection(unresolved.current.selection)
          return
        }
        const found = await request('GET', session, unresolved.current)
        if (found.receipt) { clearPending(); setStatus('提交已接收'); return }
        setRetryAllowed(unresolved.current.selection !== undefined)
        setStatus(unresolved.current.selection ? '尚未查询到接收记录；可重试原选择，提交标识保持不变' : '接收状态仍待确认，请稍后核实；没有重复发送')
        return
      }
      if (!frame.current) throw new Error('当前页面不可用')
      const modelContent = await captureInteraction(frame.current, token, epoch, lifetime.current.signal)
      setPreview({ submissionId: crypto.randomUUID(), path, intent: action.intent, modelContent })
      setStatus('')
    } catch (error) { setStatus(error instanceof Error ? error.message : '读取失败') }
    finally { lock.current = false; setBusy(false) }
  }
  const sendSelection = async (selected: Selection) => {
    try { sessionStorage.setItem(storageKey, JSON.stringify({ version: 2, selection: selected })) }
    catch { setStatus('浏览器无法保存恢复标识，本次未发送'); return }
    unresolved.current = { submissionId: selected.submissionId, selection: selected }
    setRetryAllowed(false)
    try {
      const result = await request('POST', session, selected)
      if (!result.receipt) throw new Error('缺少提交回执')
      clearPending()
      setPreview(null); setStatus('提交已接收，模型将基于本次选择继续')
    } catch (error) {
      setPreview(null)
      if (error instanceof RequestError && ['invalid-params', 'id-conflict'].includes(error.code ?? '')) {
        clearPending(); setStatus(error.message + '；本次未接纳，请重新选择')
      } else setStatus('接收状态待确认；点击核实，不会自动重发')
    }
  }
  const submit = async () => {
    if (!preview || lock.current) return
    lock.current = true; setBusy(true)
    try { await sendSelection(preview) }
    finally { lock.current = false; setBusy(false) }
  }
  const cancelPreview = () => { setPreview(null); setStatus('已取消，未发送'); requestAnimationFrame(() => primaryButton.current?.focus()) }
  const rows = preview === null ? [] : preview.modelContent !== null && typeof preview.modelContent === 'object' && !Array.isArray(preview.modelContent)
    ? Object.entries(preview.modelContent) : [['选择', preview.modelContent] as const]
  const valueText = (value: JsonValue): string => value === null ? '未设置' : typeof value === 'boolean' ? value ? '是' : '否' : typeof value === 'object' ? JSON.stringify(value, null, 2) : String(value)
  return <div data-dsh-interaction-bar="" className="viz-choice">
    <style>{CHOICE_CSS + INTERACTION_CSS}</style>
    {!preview && <button ref={primaryButton} className="viz-button viz-button--primary" type="button" disabled={busy} onClick={() => void capture()}>{busy ? '正在处理…' : unresolved.current ? retryAllowed ? '重试本次提交' : '核实提交状态' : action.label}</button>}
    {preview && <div role="dialog" aria-label="确认本次选择" className="viz-confirm" onKeyDown={event => {
      if (event.key === 'Escape' && !busy) { event.preventDefault(); cancelPreview() }
    }}>
      <h3>确认本次选择</h3>
      <p className="viz-description">确认后，模型会根据这些选择继续回答。</p>
      <dl className="viz-summary">{rows.map(([name, value]) => <div key={name}>
        <dt>{action.fieldLabels && Object.hasOwn(action.fieldLabels, name) ? action.fieldLabels[name] : name}</dt><dd>{valueText(value)}</dd>
      </div>)}</dl>
      <div className="viz-actions">
        <button ref={confirmButton} className="viz-button viz-button--primary" type="button" disabled={busy} onClick={() => void submit()}>{busy ? '正在发送…' : '确认并继续'}</button>
        <button className="viz-button" type="button" disabled={busy} onClick={cancelPreview}>返回修改</button>
      </div>
      <details><summary>查看完整发送内容</summary><p>{preview.intent}</p><pre>{JSON.stringify(preview.modelContent, null, 2)}</pre></details>
    </div>}
    <span role="status" className="viz-status">{status}</span>
  </div>
}
