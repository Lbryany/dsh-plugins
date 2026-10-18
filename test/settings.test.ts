import assert from 'node:assert/strict'
import test from 'node:test'
import { createPreferences, type PreferencesPatch } from '../src/settings.ts'

test('settings normalize the site and verify persistence rather than reporting a no-op save', async () => {
  let value = 'global'
  const settings = createPreferences({ read: () => value, writable: () => true, write: async next => { value = next.defaultSite! } })
  assert.equal((await settings.update({ defaultSite: 'cn' })).defaultSite, 'https://copilot.tencent.com')
  assert.equal(createPreferences({ read: () => value }).status().defaultSite, 'https://copilot.tencent.com')
  const noOp = createPreferences({ read: () => value, writable: () => true, write: async () => {} })
  await assert.rejects(noOp.update({ defaultSite: 'global' }), /保存/)
})

test('read-only settings reject changes and URLs cannot carry credentials', async () => {
  const settings = createPreferences({ read: () => 'global' })
  assert.equal(settings.status().writable, false)
  await assert.rejects(settings.update({ defaultSite: 'cn' }), /只读/)
  await assert.rejects(settings.update({ cacheRetention: '1h' }), /只读/)
  const writable = createPreferences({ read: () => 'global', writable: () => true, write: async () => {} })
  await assert.rejects(writable.update({ defaultSite: 'https://user:password@example.test' }), /无凭据/)
})

test('cache retention defaults, saves alone or with the site, and is verified by reading back', async () => {
  const stored: { defaultSite: string; cacheRetention?: string } = { defaultSite: 'global' }
  const writes: PreferencesPatch[] = []
  const settings = createPreferences({
    read: () => stored.defaultSite, readCacheRetention: () => stored.cacheRetention, writable: () => true,
    write: async patch => { writes.push(patch); Object.assign(stored, patch) },
  })
  assert.equal(settings.status().cacheRetention, 'default')
  assert.equal((await settings.update({ cacheRetention: '1h' })).cacheRetention, '1h')
  assert.deepEqual(writes.at(-1), { cacheRetention: '1h' })
  const both = await settings.update({ defaultSite: 'cn', cacheRetention: 'default' })
  assert.deepEqual([both.defaultSite, both.cacheRetention], ['https://copilot.tencent.com', 'default'])
  await assert.rejects(settings.update({ cacheRetention: 'forever' }), /缓存/)
  await assert.rejects(settings.update({}), /没有/)
  stored.cacheRetention = 'bogus'
  assert.equal(settings.status().cacheRetention, 'default')
  const noOp = createPreferences({ read: () => 'global', readCacheRetention: () => 'default', writable: () => true, write: async () => {} })
  await assert.rejects(noOp.update({ cacheRetention: '1h' }), /保存/)
})
