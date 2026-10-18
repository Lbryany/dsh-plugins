export const PROVIDER = 'codebuddy'
export const DEFAULT_SITE = 'https://www.codebuddy.ai'
export const REASONING_LEVELS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const
export type ReasoningLevel = typeof REASONING_LEVELS[number]
/** 请求体 cache_retention 的取值：long 约 1 小时（官方 CLI 默认），short 约 5 分钟。 */
export const CACHE_RETENTIONS = ['long', 'short'] as const
export type CacheRetention = typeof CACHE_RETENTIONS[number]

export interface LoginView {
  phase: 'idle' | 'starting' | 'waiting_browser' | 'authenticated' | 'failed' | 'cancelled'
  loginId?: string
  site?: string
  startedAt?: number
  authorizationUrl?: string
  error?: 'login-failed'
  warning?: 'models-unavailable'
}

export interface CatalogModel {
  id: string
  name: string
  reasoning: boolean
  contextWindow: number
}

export interface CatalogView {
  status: 'idle' | 'refreshing' | 'ready' | 'error'
  models: CatalogModel[]
  source?: string
  updatedAt?: number
  cached: boolean
  error?: string
}

export interface AccountView {
  hasCredential: boolean
  site?: string
  expiresAt?: number
}

export interface StatusView {
  account: AccountView
  login: LoginView
  catalog: CatalogView
}

export interface PreferencesView { defaultSite: string; cacheRetention: CacheRetention; writable: boolean }
export interface DefaultModelView {
  available: boolean
  provider?: string
  model?: string
  reasoningEffort?: string
}

export class PublicError extends Error {
  readonly code: string
  constructor(code: string, message: string) { super(message); this.code = code }
}

export function isCacheRetention(value: unknown): value is CacheRetention {
  return (CACHE_RETENTIONS as readonly unknown[]).includes(value)
}

/** 读配置用：旧版的 default / 1h 以及缺失、非法值都按 CLI 默认 long。 */
export function normalizeCacheRetention(value: unknown): CacheRetention {
  return value === 'short' ? 'short' : 'long'
}

export function normalizeSite(raw: string): string {
  const input = raw.trim()
  if (!input || ['global', 'intl'].includes(input.toLowerCase())) return DEFAULT_SITE
  if (['cn', 'china'].includes(input.toLowerCase())) return 'https://copilot.tencent.com'
  let url: URL
  try { url = new URL(input) } catch { throw new PublicError('bad-request', '请输入 cn、global 或完整站点 URL。') }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new PublicError('bad-request', '站点必须是无凭据、查询参数和片段的 HTTP(S) URL。')
  }
  return url.origin
}
