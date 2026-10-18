import assert from 'node:assert/strict'
import test from 'node:test'
import { createRpcHandler } from '../src/rpc.ts'
import { createPreferences } from '../src/settings.ts'
import type { CodeBuddyService } from '../src/service.ts'

test('management rejects extra fields and never reflects provider exceptions', async () => {
  const service = { status: async () => { throw Error('Bearer token-do-not-leak') } } as unknown as CodeBuddyService
  const rpc = createRpcHandler({ service, preferences: createPreferences({ read: () => 'global' }) })
  const signal = new AbortController().signal
  const bad = await rpc('status', { token: 'x' }, signal)
  assert.equal(bad.ok, false)
  if (!bad.ok) assert.equal(bad.error.code, 'bad-request')
  const failed = await rpc('status', {}, signal)
  assert.equal(failed.ok, false)
  assert.doesNotMatch(JSON.stringify(failed), /token-do-not-leak/)
  const unknown = await rpc('shell/run', {}, signal)
  if (!unknown.ok) assert.equal(unknown.error.code, 'not-found')
})

test('preferences/update accepts either field and rejects missing, empty, or invalid values', async () => {
  const stored: { defaultSite: string; cacheRetention?: string } = { defaultSite: 'global' }
  const preferences = createPreferences({
    read: () => stored.defaultSite, readCacheRetention: () => stored.cacheRetention, writable: () => true,
    write: async patch => { Object.assign(stored, patch) },
  })
  const rpc = createRpcHandler({ service: {} as CodeBuddyService, preferences })
  const signal = new AbortController().signal
  const retention = await rpc('preferences/update', { cacheRetention: 'short' }, signal)
  assert.deepEqual(retention, { ok: true, value: { defaultSite: 'https://www.codebuddy.ai', cacheRetention: 'short', writable: true } })
  const site = await rpc('preferences/update', { defaultSite: 'cn' }, signal)
  assert.equal(site.ok && (site.value as { cacheRetention: string }).cacheRetention, 'short')
  const status = await rpc('preferences/status', {}, signal)
  assert.deepEqual(status, { ok: true, value: { defaultSite: 'https://copilot.tencent.com', cacheRetention: 'short', writable: true } })
  for (const payload of [{}, { defaultSite: '' }, { cacheRetention: 'forever' }, { cacheRetention: '1h' }, { cacheRetention: 1 }, { ttl: 'long' }]) {
    const result = await rpc('preferences/update', payload, signal)
    assert.equal(result.ok, false, JSON.stringify(payload))
    if (!result.ok) assert.equal(result.error.code, 'bad-request')
  }
  const readOnly = createRpcHandler({ service: {} as CodeBuddyService, preferences: createPreferences({ read: () => 'global' }) })
  const denied = await readOnly('preferences/update', { cacheRetention: 'short' }, signal)
  assert.equal(!denied.ok && denied.error.code, 'read-only')
})
