// jobs/outbox.js — durable side effects with retry/backoff and dead-lettering.
// Table (add as a migration):
//   CREATE TABLE outbox (
//     id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, payload TEXT NOT NULL,
//     dedupe_key TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','dead')),
//     attempts INTEGER NOT NULL DEFAULT 0, run_at INTEGER NOT NULL, last_error TEXT,
//     created_at INTEGER NOT NULL DEFAULT (unixepoch()));
//   CREATE INDEX outbox_due ON outbox(status, run_at);

const MAX_ATTEMPTS = 8;

export const enqueue = (db, type, payload, dedupeKey = null) =>
  db.prepare('INSERT OR IGNORE INTO outbox(type, payload, dedupe_key, run_at) VALUES (?,?,?,?)')
    .run(type, JSON.stringify(payload), dedupeKey, Date.now());

export function startOutboxWorker({ db, handlers, logger, intervalMs = 2000 }) {
  let running = false;
  let stopped = false;

  const take = db.prepare(`SELECT * FROM outbox WHERE status='pending' AND run_at <= ? ORDER BY run_at LIMIT 20`);
  const done = db.prepare(`UPDATE outbox SET status='done' WHERE id=?`);
  const fail = db.prepare(`UPDATE outbox SET attempts=attempts+1, last_error=?, run_at=?, status=? WHERE id=?`);

  async function tick() {
    if (running || stopped) return; // never overlap
    running = true;
    try {
      for (const row of take.all(Date.now())) {
        if (stopped) break;
        const handler = handlers[row.type];
        try {
          if (!handler) throw new Error(`no handler for ${row.type}`);
          await handler(JSON.parse(row.payload), { id: row.id, dedupeKey: row.dedupe_key });
          done.run(row.id);
        } catch (err) {
          const attempts = row.attempts + 1;
          const dead = attempts >= MAX_ATTEMPTS;
          const backoff = Math.min(15 * 60_000, 2 ** attempts * 1000) * (0.5 + Math.random());
          fail.run(String(err.message).slice(0, 500), Date.now() + backoff, dead ? 'dead' : 'pending', row.id);
          logger[dead ? 'error' : 'warn']({ id: row.id, type: row.type, attempts, err }, dead ? 'outbox job dead' : 'outbox job retry');
        }
      }
    } catch (err) {
      logger.error({ err }, 'outbox tick failed');
    } finally { running = false; }
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return { stop: async () => { stopped = true; clearInterval(timer); while (running) await new Promise((r) => setTimeout(r, 50)); } };
}

export const outboxStats = (db) =>
  db.prepare(`SELECT status, COUNT(*) n, MIN(run_at) oldest FROM outbox GROUP BY status`).all();
