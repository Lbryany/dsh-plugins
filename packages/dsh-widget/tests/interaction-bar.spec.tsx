// @vitest-environment jsdom
import { act, StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { expect, it, vi } from 'vitest'
import { InteractionBar, captureInteraction } from '../src/client/InteractionBar.tsx'

it('shows labelled immutable choices, keeps technical details collapsed, and sends the exact captured values', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const iframe = document.createElement('iframe'); document.body.append(iframe)
  const target = iframe.contentWindow!
  const values = { participants: 12, duration: 90, topic: '<img src=x onerror=alert(1)>' }
  vi.spyOn(target, 'postMessage').mockImplementation(request => {
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { source: target,
      data: { ...request, type: 'dsh-widget:captured', modelContent: values },
    })))
  })
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ receipt: { inputId: 'input' } }) } as Response)
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  const action = { label: '生成议程', intent: 'INTERNAL_INSTRUCTION', fieldLabels: { participants: '人数（人）', duration: '时长（分钟）', topic: '主题' } }
  await act(async () => root.render(<InteractionBar action={action} epoch="e" session="visual" path="/visual" token="t" frame={{ current: iframe }} />))
  await act(async () => { container.querySelector('button')!.click(); await Promise.resolve() })
  const dialog = container.querySelector('[role=dialog]')!
  expect(dialog.querySelector('dl')?.textContent).toContain('人数（人）12')
  expect(dialog.querySelector('dl')?.textContent).toContain('时长（分钟）90')
  expect(dialog.querySelector('dl')?.textContent).toContain(values.topic)
  expect(dialog.querySelector('img')).toBeNull()
  expect(dialog.querySelector('details')?.open).toBe(false)
  expect(dialog.querySelector('details')?.textContent).toContain('INTERNAL_INSTRUCTION')
  expect(document.activeElement?.textContent).toBe('确认并继续')
  values.duration = 15 // later page edits must not mutate the captured preview
  await act(async () => { (dialog.querySelector('button') as HTMLButtonElement).click(); await Promise.resolve() })
  const sent = JSON.parse(String(fetchMock.mock.calls[0]![1]!.body))
  expect(sent.submission.modelContent).toEqual({ participants: 12, duration: 90, topic: '<img src=x onerror=alert(1)>' })
  expect(sent.submission.intent).toBe('INTERNAL_INSTRUCTION')
  expect(sent.submission).not.toHaveProperty('fieldLabels')
  await act(async () => root.unmount()); iframe.remove(); container.remove(); vi.restoreAllMocks()
})

it('captures and previews under StrictMode effect replay', async () => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  const iframe = document.createElement('iframe')
  document.body.append(iframe)
  const target = iframe.contentWindow!
  vi.spyOn(target, 'postMessage').mockImplementation((data: unknown) => {
    const request = data as { token: string; captureId: string; epoch: string }
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', {
      source: target, data: { type: 'dsh-widget:captured', token: request.token, epoch: request.epoch, captureId: request.captureId, modelContent: { hours: 30 } },
    })))
  })
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<StrictMode><InteractionBar action={{ label: '分析', intent: '分析选择' }} epoch="epoch-1" session="s" path="/card" token="t" frame={{ current: iframe }} /></StrictMode>))
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); await new Promise(resolve => setTimeout(resolve, 0)) })
  expect(container.querySelector('[role=dialog]')?.textContent).toContain('30')
  await act(async () => root.unmount())
  vi.restoreAllMocks(); iframe.remove(); container.remove()
})

it('restores an uncertain receipt after remount and only looks it up', async () => {
  const key = 'dsh-widget:pending:' + JSON.stringify(['recover', '/card'])
  sessionStorage.setItem(key, 'pending-123')
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ receipt: { inputId: 'input-123' } }) } as Response)
  const container = document.createElement('div'); document.body.append(container)
  const root = createRoot(container)
  await act(async () => root.render(<InteractionBar action={{ label: '分析', intent: '分析选择' }} epoch="new" session="recover" path="/card" token="t" frame={{ current: null }} />))
  expect(container.querySelector('button')?.textContent).toBe('核实提交状态')
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); await Promise.resolve() })
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(fetchMock.mock.calls[0]![1]?.method).toBe('GET')
  expect(sessionStorage.getItem(key)).toBe(null)
  expect(container.textContent).toContain('提交已接收')
  await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks()
})

it('ignores foreign sources, wrong tokens and stale epochs before accepting the current capture', async () => {
  const iframe = document.createElement('iframe'); document.body.append(iframe)
  const target = iframe.contentWindow!
  let payload: { token: string; captureId: string; epoch: string } | undefined
  vi.spyOn(target, 'postMessage').mockImplementation(data => { payload = data })
  const controller = new AbortController()
  const pending = captureInteraction(iframe, 'token-current', 'epoch-current', controller.signal)
  const base = { ...payload, type: 'dsh-widget:captured', modelContent: { value: 'wrong' } }
  window.dispatchEvent(new MessageEvent('message', { source: window, data: base }))
  window.dispatchEvent(new MessageEvent('message', { source: target, data: { ...base, token: 'other' } }))
  window.dispatchEvent(new MessageEvent('message', { source: target, data: { ...base, epoch: 'old' } }))
  window.dispatchEvent(new MessageEvent('message', { source: target, data: { ...base, captureId: 'old-request' } }))
  window.dispatchEvent(new MessageEvent('message', { source: target, data: { ...base, modelContent: { value: 'right' } } }))
  await expect(pending).resolves.toEqual({ value: 'right' })
  iframe.remove(); vi.restoreAllMocks()
})

it('after an unknown send and reload, retries only the identical confirmed selection and ID', async () => {
  const iframe = document.createElement('iframe'); document.body.append(iframe)
  const target = iframe.contentWindow!
  vi.spyOn(target, 'postMessage').mockImplementation(request => {
    queueMicrotask(() => window.dispatchEvent(new MessageEvent('message', { source: target,
      data: { ...request, type: 'dsh-widget:captured', modelContent: { hours: 30 } },
    })))
  })
  const posts: unknown[] = []
  const mock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, init) => {
    if (init?.method === 'GET') return { ok: true, json: async () => ({ receipt: null }) } as Response
    const body = JSON.parse(String(init?.body)); posts.push(body)
    if (posts.length === 1) throw new Error('network disconnected')
    return { ok: true, json: async () => ({ receipt: { inputId: 'one-input', submissionId: body.submission.submissionId } }) } as Response
  })
  const container = document.createElement('div'); document.body.append(container)
  let root = createRoot(container)
  const props = { action: { label: '分析', intent: '分析选择' }, session: 'retry-same', path: '/retry', token: 't', epoch: 'first', frame: { current: iframe } }
  await act(async () => root.render(<InteractionBar {...props} />))
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); await Promise.resolve() })
  await act(async () => { (container.querySelector('[role=dialog] button') as HTMLButtonElement).click(); await Promise.resolve() })
  expect(posts).toHaveLength(1)
  await act(async () => root.unmount()); root = createRoot(container)
  await act(async () => root.render(<InteractionBar {...props} epoch="reloaded" frame={{ current: null }} />))
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); await Promise.resolve() })
  expect(container.querySelector('button')?.textContent).toBe('重试本次提交')
  await act(async () => { (container.querySelector('button') as HTMLButtonElement).click(); await Promise.resolve() })
  expect(posts).toHaveLength(2); expect(posts[1]).toEqual(posts[0]); expect(mock.mock.calls.map(c => c[1]?.method)).toEqual(['POST', 'GET', 'POST'])
  expect(container.textContent).toContain('提交已接收')
  await act(async () => root.unmount()); container.remove(); iframe.remove(); vi.restoreAllMocks()
})
