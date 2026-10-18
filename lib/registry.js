// 注册表：所有 dsh 进程共享的目录，一进程一份 <pid>.json（谁在线、叫什么、怎么连）+ <pid>.key（token，0600）+ <pid>.sock。
// 与 dsh 无关，单测直接用临时目录。
import { chmodSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';

export const PROTOCOL = 1;

// 目录优先级：$DSH_PEER_DIR > $XDG_RUNTIME_DIR/dsh-peer > ~/.dsh-peer/run。不放 DSH_HOME 下：不同 profile 的 DSH_HOME 可能不同
export function resolvePeerDir(env = process.env) {
  if (env.DSH_PEER_DIR) return env.DSH_PEER_DIR;
  if (env.XDG_RUNTIME_DIR) return join(env.XDG_RUNTIME_DIR, 'dsh-peer');
  return join(homedir(), '.dsh-peer', 'run');
}

// 改名持久化文件（按 sessionId），与 DSH_HOME 无关
export const defaultNamesFile = () => join(homedir(), '.dsh-peer', 'names.json');

// socket 路径：Unix 下放注册表目录；Windows 用 named pipe（只写不验）
export const socketPathOf = (dir, pid) => (process.platform === 'win32' ? `\\\\.\\pipe\\dsh-peer-${pid}` : join(dir, `${pid}.sock`));

export function defaultIsAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (error) { return error && error.code === 'EPERM'; }
}

// Linux：/proc/<pid>/stat 第 22 字段（进程启动时刻，clock ticks）。comm 里可能有空格和括号，从最后一个 ')' 之后切
export function defaultProcStartOf(pid) {
  if (process.platform !== 'linux') return null;
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const rest = stat.slice(stat.lastIndexOf(')') + 2).split(' ');
    // rest[0] 是第 3 字段（state），第 22 字段即 rest[19]
    return rest[19] || null;
  } catch { return null; }
}

// 原子写：先写 .tmp 再 rename
function atomicWrite(file, text, mode) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, text, { mode });
  chmodSync(tmp, mode);
  renameSync(tmp, file);
}

const unlinkQuiet = (file) => { try { unlinkSync(file); } catch { /* 已不存在 */ } };

export function createRegistry({ dir, pid, isAlive = defaultIsAlive, procStartOf = defaultProcStartOf, namesFile = defaultNamesFile() }) {
  const pathsOf = (p) => ({ json: join(dir, `${p}.json`), key: join(dir, `${p}.key`), sock: socketPathOf(dir, p) });
  const self = pathsOf(pid);

  function ensureDir() {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }

  // 删一个进程的三件（残留清理与本进程退出共用）
  function removeFiles(p) {
    const f = pathsOf(p);
    unlinkQuiet(f.json); unlinkQuiet(f.key);
    if (process.platform !== 'win32') unlinkQuiet(f.sock);
  }

  // 活性：kill(pid, 0) 失败，或 Linux 下 procStart 与当前不一致（pid 被复用）→ 残留
  function alive(record) {
    if (!isAlive(record.pid)) return false;
    if (record.procStart == null) return true;
    const now = procStartOf(record.pid);
    return now == null || String(now) === String(record.procStart);
  }

  return {
    dir,
    paths: self,
    ensureDir,
    writeRecord(record) { atomicWrite(self.json, `${JSON.stringify(record, null, 2)}\n`, 0o644); },
    writeKey(token) { atomicWrite(self.key, `${JSON.stringify({ token })}\n`, 0o600); },
    readKey(p) {
      try { const token = JSON.parse(readFileSync(pathsOf(p).key, 'utf8')).token; return typeof token === 'string' ? token : null; } catch { return null; }
    },
    removeSelf() { removeFiles(pid); },
    // 读其他进程的记录；死掉的由读的一方顺手删掉三件
    readOthers() {
      let names;
      try { names = readdirSync(dir); } catch { return []; }
      const out = [];
      for (const file of names) {
        const m = /^(\d+)\.json$/.exec(file);
        if (!m) continue;
        const p = Number(m[1]);
        if (p === pid) continue;
        let record;
        try { record = JSON.parse(readFileSync(join(dir, file), 'utf8')); } catch { continue; } // 写到一半或损坏：跳过，不删
        if (!record || typeof record !== 'object' || record.pid !== p) continue;
        if (!alive(record)) { removeFiles(p); continue; }
        if (record.protocol !== PROTOCOL) continue; // 版本不认识：不列，也不删（可能是新版本的活进程）
        out.push(record);
      }
      return out;
    },
    loadNames() {
      try { const v = JSON.parse(readFileSync(namesFile, 'utf8')); return v && typeof v === 'object' ? v : {}; } catch { return {}; }
    },
    saveNames(map) {
      mkdirSync(dirname(namesFile), { recursive: true, mode: 0o700 });
      atomicWrite(namesFile, `${JSON.stringify(map, null, 2)}\n`, 0o600);
    },
    exists: () => existsSync(self.json),
  };
}
