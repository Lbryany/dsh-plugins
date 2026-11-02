import { afterEach, describe, expect, it } from 'vitest'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  interactionAdmission, captureContext, contextFromSource,
  type InputRecord, type InputAdapter,
} from '../src/interaction-admission.ts'

// A durable log Adapter: reads across module recreation, not a send spy.
const temporaryDirectories: string[] = []
afterEach(async () => { for (const dir of temporaryDirectories.splice(0)) await rm(dir, { recursive: true }) })
async function fixture() {
  const dir = await mkdtemp(join(tmpdir(), 'widget-admission-'))
  temporaryDirectories.push(dir)
  const file = join(dir, 'inputs.json')
  await writeFile(file, '[]')
  const records = async (): Promise<InputRecord[]> => JSON.parse(await readFile(file, 'utf8'))
  let loseReceipt = false
  const adapter: InputAdapter = {
    async find(session, id) { return (await records()).find(r => r.session === session && r.submissionId === id) ?? null },
    async append(record) {
      const rows = await records()
      rows.push(record)
      await writeFile(file, JSON.stringify(rows))
      if (loseReceipt) throw new Error('connection lost after commit')
    },
  }
  return { adapter, records, loseReceipt: () => { loseReceipt = true } }
}
const input = () => ({ submissionId: 'submit-1', path: '/card', intent: '分析本次选择', modelContent: { plan: 'A', hours: 30 } })
const states = [{ path: '/card', state: { modelContent: { plan: 'draft' }, privateContent: { sentinel: 'PRIVATE-NEVER-SEND' } }, updatedAt: 1 }]

describe('interaction input admission', () => {
  it('freezes the explicit selection before any async work; excludes private state', async () => {
    const f = await fixture()
    const service = interactionAdmission(f.adapter, () => states)
    const value = input()
    const pending = service.submit('session-a', value)
    value.modelContent.plan = 'B'
    states[0]!.state.modelContent.plan = 'later'
    const receipt = await pending
    const [record] = await f.records()
    expect(record!.context).toEqual([{ path: '/card', state: { plan: 'A', hours: 30 } }])
    expect(JSON.stringify(record)).not.toContain('PRIVATE-NEVER-SEND')
    expect(receipt.inputId).toBe(record!.inputId)
  })
  it('deduplicates concurrent clicks and resumes the same receipt after recreation', async () => {
    const f = await fixture()
    const service = interactionAdmission(f.adapter, () => states)
    const [a, b] = await Promise.all([service.submit('session-a', input()), service.submit('session-a', input())])
    expect(a).toEqual(b)
    expect(await interactionAdmission(f.adapter, () => []).submit('session-a', input())).toEqual(a)
    expect(await f.records()).toHaveLength(1)
    await expect(service.submit('session-a', { ...input(), modelContent: { plan: 'B' } })).rejects.toMatchObject({ code: 'id-conflict' })
  })
  it('recovers a lost receipt by lookup without another append', async () => {
    const f = await fixture()
    f.loseReceipt()
    const service = interactionAdmission(f.adapter, () => states)
    await expect(service.submit('session-a', input())).rejects.toMatchObject({ code: 'outcome-unknown' })
    expect(await service.lookup('session-a', 'submit-1')).toMatchObject({ submissionId: 'submit-1' })
    await service.submit('session-a', input())
    expect(await f.records()).toHaveLength(1)
  })
  it('keeps sessions independent and rejects invalid public input before append', async () => {
    const f = await fixture()
    const service = interactionAdmission(f.adapter, () => states)
    await service.submit('session-a', input())
    await service.submit('session-b', input())
    expect(await f.records()).toHaveLength(2)
    await expect(service.submit('session-a', { ...input(), privateContent: 'secret' })).rejects.toMatchObject({ code: 'invalid-params' })
    await expect(service.submit('session-a', { ...input(), modelContent: { x: NaN } })).rejects.toMatchObject({ code: 'invalid-params' })
    expect(await f.records()).toHaveLength(2)
  })
  it('captures ordinary input state once and restores it from message source after reload', () => {
    const context = captureContext(states)
    const source = { kind: 'user', dshWidget: { version: 1, context } }
    const durable = JSON.parse(JSON.stringify(source))
    states[0]!.state.modelContent.plan = 'changed-again'
    expect(contextFromSource(durable)).toEqual(context)
    expect(contextFromSource({ kind: 'user' })).toBe(null)
    expect(() => captureContext(Array.from({ length: 101 }, (_, i) => ({ ...states[0]!, path: String(i) })))).toThrow()
  })
})
