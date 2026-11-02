import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';

export const GUARD_DEFAULTS = Object.freeze({ dedupMs: 60000, shortMs: 60000, shortLimit: 6, longMs: 600000, longLimit: 12, maxPairs: 1024, maxFingerprints: 64 });
export function createGuard({ now = () => performance.now(), enabled = true, onPause = () => {}, ...options } = {}) {
  const cfg = { ...GUARD_DEFAULTS, ...options };
  for (const [key, value] of Object.entries(cfg)) {
    if (!(key in GUARD_DEFAULTS) || !Number.isSafeInteger(value) || value < 1) throw new Error(`Invalid peer protection option: ${key}`);
  }
  if (cfg.maxPairs > 1024 || cfg.maxFingerprints > 64 || cfg.longLimit > 64 || cfg.shortLimit > cfg.longLimit || cfg.shortMs > cfg.longMs) throw new Error('Invalid peer protection bounds');
  const pairs = new Map();
  const keyOf = (from, to) => JSON.stringify([from, to]);
  let lastTime = -Infinity;
  const clock = () => (lastTime = Math.max(lastTime, now()));
  function prune(s, at) {
    s.times = s.times.filter(n => at - n < cfg.longMs);
    for (const [key, n] of s.fingerprints) if (at - n >= cfg.dedupMs) s.fingerprints.delete(key);
  }
  function reserve(from, to, text, steer, scope = '') {
    if (!enabled) return { ok: true, commit() {}, rollback() {} };
    const at = clock(), key = keyOf(from, to);
    let s = pairs.get(key);
    if (!s) {
      for (const [k, v] of pairs) { prune(v, at); if (!v.paused && !v.times.length && !v.fingerprints.size && !v.pending.size) pairs.delete(k); }
      if (pairs.size >= cfg.maxPairs) return { ok: false, error: 'guard-capacity' };
      s = { from, to, times: [], fingerprints: new Map(), pending: new Map(), paused: false }; pairs.set(key, s);
    }
    prune(s, at);
    const fingerprint = createHash('sha256').update(steer ? 'steer\0' : 'followup\0').update(scope).update(text, 'utf8').digest('hex');
    if (s.fingerprints.has(fingerprint) || [...s.pending.values()].some(v => v.fingerprint === fingerprint)) return { ok: false, error: 'duplicate-content' };
    if (s.paused) return { ok: false, error: 'conversation-paused' };
    if (s.times.length >= cfg.longLimit) {
      s.paused = true; onPause({ from, to, count: s.times.length });
      return { ok: false, error: 'conversation-paused' };
    }
    // Pending work occupies capacity but cannot cause a permanent pause until committed.
    if (s.times.length + s.pending.size >= cfg.longLimit) return { ok: false, error: 'rate-limited', retryAfterMs: cfg.longMs };
    const short = s.times.filter(n => at - n < cfg.shortMs);
    if (short.length + s.pending.size >= cfg.shortLimit) return { ok: false, error: 'rate-limited', retryAfterMs: short.length ? Math.max(1, cfg.shortMs - (at - short[0])) : cfg.shortMs };
    if (s.fingerprints.size + s.pending.size >= cfg.maxFingerprints) return { ok: false, error: 'guard-capacity' };
    const ticket = Symbol(); s.pending.set(ticket, { fingerprint });
    return { ok: true,
      commit() { if (!s.pending.delete(ticket)) return; const n = clock(); s.times.push(n); s.fingerprints.set(fingerprint, n); },
      rollback() { s.pending.delete(ticket); },
    };
  }
  return { reserve,
    resume(from, to) {
      const key = keyOf(from, to), s = pairs.get(key);
      if (s?.pending.size) return false;
      pairs.delete(key); return true;
    },
    status(to) {
      const at = clock();
      return [...pairs.values()].filter(s => s.to === to).map(s => { prune(s, at); return { from: s.from, to: s.to, paused: s.paused, count: s.times.length }; });
    },
    clear() { pairs.clear(); },
  };
}
