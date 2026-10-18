import { DEFAULT_SITE, isCacheRetention, normalizeCacheRetention, normalizeSite, PublicError, type CacheRetention, type PreferencesView } from './contract.ts'

export interface PreferencesPatch { defaultSite?: string; cacheRetention?: CacheRetention }

interface PreferencesBackend {
  read(): string
  readCacheRetention?(): string | undefined
  writable?(): boolean
  /** 只含要改的字段；宿主 settings.update 按字段合并。 */
  write?(patch: PreferencesPatch): Promise<void>
}

export function createPreferences(backend: PreferencesBackend) {
  const status = (): PreferencesView => {
    return {
      defaultSite: normalizeSite(backend.read() || DEFAULT_SITE),
      cacheRetention: normalizeCacheRetention(backend.readCacheRetention?.()),
      writable: Boolean(backend.write && backend.writable?.()),
    }
  }
  return {
    status,
    async update(patch: { defaultSite?: string; cacheRetention?: string }): Promise<PreferencesView> {
      if (!status().writable) throw new PublicError('read-only', '此 DSH 配置为只读。')
      const next: PreferencesPatch = {}
      if (patch.defaultSite !== undefined) next.defaultSite = normalizeSite(patch.defaultSite)
      if (patch.cacheRetention !== undefined) {
        if (!isCacheRetention(patch.cacheRetention)) throw new PublicError('bad-request', '无效的提示缓存保留时长。')
        next.cacheRetention = patch.cacheRetention
      }
      if (next.defaultSite === undefined && next.cacheRetention === undefined) throw new PublicError('bad-request', '没有要保存的设置。')
      await backend.write!(next)
      const saved = status()
      if ((next.defaultSite !== undefined && saved.defaultSite !== next.defaultSite)
        || (next.cacheRetention !== undefined && saved.cacheRetention !== next.cacheRetention)) {
        throw new PublicError('not-saved', '配置未能保存，请检查 DSH 配置权限。')
      }
      return saved
    },
  }
}

export type Preferences = ReturnType<typeof createPreferences>
