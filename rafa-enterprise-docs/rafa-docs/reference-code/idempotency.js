// middleware/idempotency.js — replay-safe POSTs.
// Table: CREATE TABLE idempotency_keys (key TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
//   status INTEGER, response TEXT, created_at INTEGER NOT NULL DEFAULT (unixepoch()));
import { createHash } from 'node:crypto';

export function idempotency(db) {
  const get = db.prepare('SELECT * FROM idempotency_keys WHERE key = ?');
  const insert = db.prepare('INSERT OR IGNORE INTO idempotency_keys(key, request_hash) VALUES (?, ?)');
  const save = db.prepare('UPDATE idempotency_keys SET status=?, response=? WHERE key=?');

  return (req, res, next) => {
    const key = req.get('idempotency-key');
    if (!key) return next();
    if (!/^[A-Za-z0-9_-]{16,80}$/.test(key)) {
      return res.status(400).json({ error: { code: 'VALIDATION_FAILED', message: 'Invalid Idempotency-Key', requestId: req.id } });
    }
    const hash = createHash('sha256').update(req.method + req.path + JSON.stringify(req.body ?? {})).digest('hex');
    const scoped = `${req.ip}:${key}`;
    const inserted = insert.run(scoped, hash).changes === 1;

    if (!inserted) {
      const row = get.get(scoped);
      if (row.request_hash !== hash) {
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Idempotency-Key reused with a different request', requestId: req.id } });
      }
      if (row.status == null) {
        res.set('Retry-After', '1');
        return res.status(409).json({ error: { code: 'CONFLICT', message: 'Original request still in progress', requestId: req.id } });
      }
      res.set('Idempotent-Replay', 'true');
      return res.status(row.status).json(JSON.parse(row.response));
    }

    const json = res.json.bind(res);
    res.json = (body) => { save.run(res.statusCode, JSON.stringify(body), scoped); return json(body); };
    next();
  };
}
