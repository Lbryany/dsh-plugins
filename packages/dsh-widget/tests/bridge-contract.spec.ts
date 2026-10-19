// B1 契约：状态大小、JSON-only、多余键；追问正文；外链协议
import { describe, expect, it } from 'vitest'
import {
  followUpSchema,
  openExternalSchema,
  PROMPT_MAX_BYTES,
  saveStateRequestSchema,
  STATE_MAX_BYTES,
  TITLE_MAX_CHARS,
  widgetStateSchema,
} from '../src/bridge-contract.ts'

describe('widgetStateSchema', () => {
  it('接受两个键的 JSON，缺省补 null', () => {
    expect(widgetStateSchema.parse({ modelContent: { choice: 'B' } })).toEqual({ modelContent: { choice: 'B' }, privateContent: null })
    expect(widgetStateSchema.parse({})).toEqual({ modelContent: null, privateContent: null })
  })

  it('拒绝序列化后超过 16 KiB 的状态', () => {
    const half = 'x'.repeat(STATE_MAX_BYTES / 2)
    expect(widgetStateSchema.safeParse({ modelContent: half, privateContent: half }).success).toBe(false)
    expect(widgetStateSchema.safeParse({ modelContent: 'x'.repeat(STATE_MAX_BYTES - 64) }).success).toBe(true)
  })

  it('按 UTF-8 字节而不是字符计算', () => {
    expect(widgetStateSchema.safeParse({ modelContent: '选'.repeat(6000) }).success).toBe(false)
  })

  it('拒绝函数、undefined、NaN、Infinity', () => {
    expect(widgetStateSchema.safeParse({ modelContent: () => 1 }).success).toBe(false)
    expect(widgetStateSchema.safeParse({ modelContent: { a: undefined } }).success).toBe(false)
    expect(widgetStateSchema.safeParse({ modelContent: Number.NaN }).success).toBe(false)
    expect(widgetStateSchema.safeParse({ privateContent: [1, Number.POSITIVE_INFINITY] }).success).toBe(false)
  })

  it('拒绝多余键', () => {
    expect(widgetStateSchema.safeParse({ modelContent: 1, extra: 2 }).success).toBe(false)
  })
})

describe('followUpSchema', () => {
  it('拒绝空或纯空白的正文', () => {
    expect(followUpSchema.safeParse({ prompt: '' }).success).toBe(false)
    expect(followUpSchema.safeParse({ prompt: '   ' }).success).toBe(false)
  })

  it('拒绝超过 64 KiB 的正文与超长标题', () => {
    expect(followUpSchema.safeParse({ prompt: 'x'.repeat(PROMPT_MAX_BYTES + 1) }).success).toBe(false)
    expect(followUpSchema.safeParse({ prompt: 'x'.repeat(PROMPT_MAX_BYTES) }).success).toBe(true)
    expect(followUpSchema.safeParse({ prompt: 'ok', title: 't'.repeat(TITLE_MAX_CHARS + 1) }).success).toBe(false)
  })

  it('拒绝多余键', () => {
    expect(followUpSchema.safeParse({ prompt: 'ok', send: true }).success).toBe(false)
  })
})

describe('openExternalSchema', () => {
  it('只认 http(s)', () => {
    expect(openExternalSchema.safeParse({ href: 'https://example.com/a' }).success).toBe(true)
    expect(openExternalSchema.safeParse({ href: 'http://example.com' }).success).toBe(true)
    for (const href of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', '/relative', 'mailto:a@b.c']) {
      expect(openExternalSchema.safeParse({ href }).success, href).toBe(false)
    }
  })
})

describe('saveStateRequestSchema', () => {
  it('路径不能含控制字符', () => {
    const state = { modelContent: 1 }
    expect(saveStateRequestSchema.safeParse({ session: 's', path: '~/a.html', state }).success).toBe(true)
    expect(saveStateRequestSchema.safeParse({ session: 's', path: '~/a\n.html', state }).success).toBe(false)
  })
})
