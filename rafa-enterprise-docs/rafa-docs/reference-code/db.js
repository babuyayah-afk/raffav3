// db.js — SQLite with production pragmas + simple forward-only migrations.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export function openDb(file, migrationsDir) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file, { timeout: 5000 });
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -20000');
  db.pragma('wal_autocheckpoint = 1000');
  db.pragma('journal_size_limit = 67108864');

  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);

  const applied = new Map(db.prepare('SELECT version, checksum FROM schema_migrations').all().map((r) => [r.version, r.checksum]));
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    if (applied.has(f)) {
      if (applied.get(f) !== checksum) throw new Error(`Migration ${f} was modified after being applied`);
      continue;
    }
    db.transaction(() => {
      db.exec(sql);
      db.prepare('INSERT INTO schema_migrations(version, checksum) VALUES (?, ?)').run(f, checksum);
    })();
  }
  return db;
}

export function readiness(db) {
  db.prepare('SELECT 1').get();
  return true;
}

export function closeDb(db) {
  try { db.pragma('wal_checkpoint(TRUNCATE)'); db.pragma('optimize'); } finally { db.close(); }
}
