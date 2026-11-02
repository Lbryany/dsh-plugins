import React, { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Frame } from '../../src/client/VisualizeCard.tsx'
import fragment from '../../assets/examples/choice-form.html?raw'
import './preview.css'

const states = new Map()
const receipts = new Map()
const submissions: unknown[] = []
let behavior = 'success'
const originalFetch = window.fetch.bind(window)
window.fetch = async (url, init) => {
  if (!String(url).includes('/api/dsh-widget/interaction')) return originalFetch(url, init)
  if (init?.method === 'POST') {
    const payload = JSON.parse(String(init.body))
    submissions.push(payload)
    window.dispatchEvent(new Event('preview-submission'))
    await new Promise(resolve => setTimeout(resolve, 1200))
    if (behavior === 'fail') throw new Error('模拟网络断开')
    const receipt = { inputId: 'preview-' + submissions.length }
    receipts.set(payload.submission.submissionId, receipt)
    return Response.json({ receipt })
  }
  const id = new URL(String(url)).searchParams.get('submissionId')
  return Response.json(id ? { receipt: receipts.get(id) ?? null } : { supported: true })
}
function Card({ roomy }: { roomy: boolean }) {
  const id = roomy ? 'roomy' : 'compact'
  const [host] = useState(() => ({
    sessionId: 'visual-v2-' + id,
    loadState: async () => states.get(id) ?? null,
    saveState: async (_path, title, state) => { states.set(id, { path: '/' + id, title, state, updatedAt: Date.now() }) },
    send: async () => { throw new Error('Legacy send is not used in this preview') },
  }))
  const markup = roomy ? '<style>.viz-choice {padding:16px 8px}.viz-choice .viz-fields{grid-template-columns:1fr;gap:20px}.viz-choice h2{font-size:26px}.viz-choice .viz-field{grid-template-columns:minmax(92px,1fr) minmax(0,2fr);align-items:center}.viz-choice .viz-field--full{grid-column:auto}@media(max-width:360px){.viz-choice .viz-field{grid-template-columns:1fr}}</style>' + fragment : fragment
  return <section className="board"><h2 className="board-label">{roomy ? 'B · 分组横排' : 'A · 紧凑并列'}</h2>
    <div className="card-surface"><Frame meta={{ version: 1, title: '工作坊安排', path: '/' + id, fragment: markup, mode: 'inline', style: 'whale' }} callId={'preview-' + id} host={host} /></div>
  </section>
}
function App() {
  const [dark, setDark] = useState(false)
  const [width, setWidth] = useState('640')
  const [received, setReceived] = useState<unknown[]>([])
  useEffect(() => {
    document.body.toggleAttribute('data-ds-dark-theme', dark)
    document.body.style.colorScheme = dark ? 'dark' : 'light'
  }, [dark])
  useEffect(() => {
    const update = () => setReceived([...submissions])
    window.addEventListener('preview-submission', update)
    return () => window.removeEventListener('preview-submission', update)
  }, [])
  return <main>
    <header><p className="eyebrow">DSH WIDGET / VISUAL REVIEW</p><h1>让选择清晰，让对话继续。</h1>
      <p>同一组内容，两种布局。使用真实卡片组件与确认流程；提交仅在本页模拟，不调用模型。</p>
      <div className="toolbar"><label><input type="checkbox" checked={dark} onChange={e => setDark(e.target.checked)} /> 深色</label>
        <label>卡片宽度 <select value={width} onChange={e => setWidth(e.target.value)}><option>640</option><option>390</option></select></label>
        <label>模拟结果 <select onChange={e => { behavior = e.target.value }}><option value="success">接收成功</option><option value="fail">网络断开</option></select></label>
      </div>
    </header>
    <div className="boards" style={{ '--board-width': width + 'px' } as React.CSSProperties}><Card roomy={false} /><Card roomy /></div>
    <details className="receipt"><summary>验收记录 · 已模拟提交 {received.length} 次</summary><pre>{JSON.stringify(received, null, 2)}</pre></details>
  </main>
}
createRoot(document.getElementById('root')!).render(<App />)
