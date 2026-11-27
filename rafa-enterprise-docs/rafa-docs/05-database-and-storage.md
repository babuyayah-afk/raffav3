# 05 — Database and Storage

## 1. SQLite phase (current)

Use `better-sqlite3` (synchronous, fast; run DB calls inside short transactions) and set at startup:

```sql
PRAGMA journal_mode = WAL;          -- concurrent readers with one writer
PRAGMA synchronous = NORMAL;        -- safe with WAL, much faster than FULL
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;         -- wait instead of failing under contention
PRAGMA temp_store = MEMORY;
PRAGMA cache_size = -20000;         -- ~20 MB
PRAGMA wal_autocheckpoint = 1000;
PRAGMA journal_size_limit = 67108864;
```

Operational rules:
- One API process owns the file. Never mount the same SQLite file on two instances or on network filesystems (NFS/SMB).
- Use a persistent block volume, not ephemeral container storage. Netlify/serverless filesystems are not suitable.
- Keep write transactions short; no network calls inside a transaction.
- Run `PRAGMA optimize` on shutdown and nightly; `VACUUM` monthly off-peak (or `auto_vacuum=INCREMENTAL`).
- Integrity check weekly: `PRAGMA integrity_check;` alert on anything but `ok`.

## 2. Migrations

- Numbered SQL files in `database/migrations/` (`0001_init.sql`, …), applied by a tiny runner inside a transaction and recorded in `schema_migrations(version, applied_at, checksum)`.
- Forward-only; each migration backward-compatible with the previous app version (expand → migrate → contract) so rollbacks are safe.
- Boot refuses to start if the DB schema is newer than the code.
- Seeds only in `database/seeds/` and never run in production automatically.

## 3. Schema guidelines

- Every table: `id` (ULID/UUIDv7 text, sortable), `created_at`, `updated_at`, `status` where relevant; `CHECK` constraints on enums.
- Indexes for every admin filter/sort: `(status, created_at DESC)`, unique on normalized newsletter email.
- Soft-delete (`deleted_at`) for customer-visible records; hard purge via retention job.
- Store money as **integer minor units** (cents) with currency code; never floats.
- Store timestamps in UTC ISO-8601; display in `Africa/Nairobi`.
- Store phone as E.164 (`+2547…`), email lowercase.
- Planned tables (commerce phase): `products`, `product_variants(sku, size, color, price_minor, stock_on_hand)`, `stock_reservations`, `orders`, `order_items`, `payments`, `payment_events`, `shipments`, `refunds`, `outbox`, `audit_log`, `admin_users`, `sessions`, `feature_flags`, `idempotency_keys`.

## 4. Backups (3-2-1)

| Item | Tool | Frequency | Retention |
|---|---|---|---|
| Continuous replication of WAL | Litestream → S3-compatible bucket (R2/B2/S3) | ~1 s lag | 30 days point-in-time |
| Full snapshot | `sqlite3 .backup` or `VACUUM INTO` → gzip → age-encrypt | daily | 14 daily, 8 weekly, 6 monthly |
| Offsite copy | second provider/region | weekly | 6 months |
| Restore drill | scripted restore to staging | monthly | record time-to-restore |

Rules: encrypted before upload; bucket versioning on; separate credentials with write-only access for the app; alert if the newest backup is older than 26 h; a backup never tested is not a backup.

## 5. Move to PostgreSQL (trigger and method)

Trigger: payments/orders go live, stock reservation under concurrency, multiple instances, or reporting needs.
Why: `SELECT … FOR UPDATE SKIP LOCKED` for queues and stock, row-level locking, PITR, replicas, connection-level roles.

Method:
1. Repositories already hide SQL; implement `pg` versions (or Drizzle/Kysely) behind the same interface.
2. Provision managed Postgres (TLS required, private networking where possible); create roles: `app_rw` (DML only), `migrator` (DDL), `readonly` (reports).
3. Export with a script, load into staging, run integrity comparisons (row counts, checksums).
4. Cutover in read-only mode window (minutes), flip env `DATABASE_URL`, keep SQLite snapshot 30 days.
5. Use PgBouncer/pooling; `pool.max` small (5–10 per instance).

## 6. Storage efficiency and retention

| Data | Retention (starting proposal `[VERIFY with legal]`) | Action |
|---|---|---|
| Spam / closed inquiries | 12 months after close | purge |
| Valid enquiries/requests | 24 months | anonymize then purge |
| Newsletter subscribers | until unsubscribe + 30 days tombstone (hash only) to honor suppression | purge PII |
| Orders/payments | statutory minimum (tax records, commonly several years) `[VERIFY]` | archive |
| Logs | 30 days hot, 90 days cold, redacted | rotate |
| Outbox done rows | 14 days | purge |
| Sessions | until expiry + 7 days | purge |

Run `jobs/retention.js` nightly inside a transaction with batch deletes (≤ 1000 rows) to avoid long locks. Log counts only, never row content.

Keep payloads small: store enums, not repeated strings; avoid duplicating large blobs; compress archives (zstd/gzip).

## 6.1 Media storage

- Binaries live in object storage (Cloudflare R2 / S3 / Cloudinary), never in the DB or API disk.
- Upload via short-lived presigned URLs (expiry ≤ 5 min, size/type conditions), admin-only.
- Pipeline: original kept privately; derived **AVIF/WebP** at 400/800/1200/1600 widths; served via CDN with `Cache-Control: public, max-age=31536000, immutable` and content-hashed filenames.
- Videos: poster image, `preload="none"` or `metadata`, H.264 MP4 + optional WebM; consider Cloudflare Stream/Mux for adaptive bitrate if videos are many/long. Never autoplay with sound.
- Store in DB: key, URL, width, height, bytes, mime, alt text, checksum.
- Lifecycle rules: delete orphaned uploads after 7 days; cold-tier originals after 90 days.

## 7. Local/dev storage

`backend/data/` stays out of git; `.gitignore` for `*.db`, `*.db-wal`, `*.db-shm`. Provide `npm run db:reset` (dev only, refuses when `NODE_ENV=production`).
