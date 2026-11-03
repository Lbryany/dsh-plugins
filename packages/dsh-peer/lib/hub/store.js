import * as sqlite from 'node:sqlite';
import { chmodSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

// A deliberately small single-node store. All state transitions happen in one
// synchronous SQLite transaction, before any notification or host side effect.
export function createStore(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, 'hub.sqlite');
  const db = new (sqlite.Database || sqlite.DatabaseSync)(file);
  chmodSync(file, 0o600);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version > 1) { db.close(); throw new Error('Unsupported hub database version'); }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS records (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
    PRAGMA user_version=1;`);
  const get = db.prepare('SELECT data FROM records WHERE kind=? AND id=?');
  const all = db.prepare('SELECT data FROM records WHERE kind=? ORDER BY rowid');
  const put = db.prepare('INSERT INTO records(kind,id,data) VALUES(?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data');
  const del = db.prepare('DELETE FROM records WHERE kind=? AND id=?');
  return {
    file,
    get: (kind, id) => { const r = get.get(kind, id); return r ? JSON.parse(r.data) : undefined; },
    all: kind => all.all(kind).map(r => JSON.parse(r.data)),
    put: (kind, id, value) => put.run(kind, id, JSON.stringify(value)),
    delete: (kind, id) => del.run(kind, id),
    transaction(fn) {
      db.exec('BEGIN IMMEDIATE');
      try { const value = fn(); db.exec('COMMIT'); return value; }
      catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close() { db.close(); },
  };
}
