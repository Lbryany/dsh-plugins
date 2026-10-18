import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'
import type { ModelsStore, ModelsStoreEntry, ModelsStoreOperationOptions } from '@earendil-works/pi-ai'

/**
 * 落盘的模型目录缓存。pi-ai 的 createModels 缺省用内存 store，Host 一重启目录就空了，
 * 要等下一次联网刷新成功才有模型；刷新再失败就什么都没有。这里把 pi-ai 的 persist 结果
 * 写成 JSON，重启后先从文件恢复，再按 TTL 决定要不要联网。
 *
 * 缺省路径 `$DSH_HOME/codebuddy/models-cache.json`（没有 DSH_HOME 时 `~/.dsh/...`）；
 * 凭据本身也是按 DSH home 存的，目录缓存跟它同级即可。
 */
export function defaultModelsCachePath(): string {
  const home = process.env.DSH_HOME?.trim() || join(homedir(), '.dsh')
  return join(home, 'codebuddy', 'models-cache.json')
}

interface FileShape { version: 1; entries: Record<string, ModelsStoreEntry> }

export class FileModelsStore implements ModelsStore {
  private readonly path: string
  private queue: Promise<unknown> = Promise.resolve()

  constructor(path: string = defaultModelsCachePath()) { this.path = path }

  async read(providerId: string, options?: ModelsStoreOperationOptions): Promise<ModelsStoreEntry | undefined> {
    options?.signal?.throwIfAborted()
    const file = await this.load()
    const entry = file.entries[providerId]
    return entry && Array.isArray(entry.models) ? structuredClone(entry) : undefined
  }

  write(providerId: string, entry: ModelsStoreEntry, options?: ModelsStoreOperationOptions): Promise<void> {
    return this.mutate(options, file => { file.entries[providerId] = structuredClone(entry) as ModelsStoreEntry })
  }

  delete(providerId: string, options?: ModelsStoreOperationOptions): Promise<void> {
    return this.mutate(options, file => { delete file.entries[providerId] })
  }

  private mutate(options: ModelsStoreOperationOptions | undefined, change: (file: FileShape) => void): Promise<void> {
    const next = this.queue.then(async () => {
      options?.signal?.throwIfAborted()
      const file = await this.load()
      change(file)
      await mkdir(dirname(this.path), { recursive: true })
      const tmp = `${this.path}.${process.pid}.tmp`
      await writeFile(tmp, JSON.stringify(file, null, 2), { mode: 0o600 })
      try { await rename(tmp, this.path) } catch (error) { await rm(tmp, { force: true }); throw error }
    })
    this.queue = next.catch(() => {})
    return next
  }

  /** 文件不存在、损坏或版本不对都当空：目录缓存丢了最多重新刷新一次，不能让插件起不来。 */
  private async load(): Promise<FileShape> {
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path, 'utf8'))
      if (parsed && typeof parsed === 'object' && (parsed as FileShape).version === 1 && typeof (parsed as FileShape).entries === 'object' && (parsed as FileShape).entries !== null) {
        return parsed as FileShape
      }
    } catch { /* 缺失或损坏 */ }
    return { version: 1, entries: {} }
  }
}
