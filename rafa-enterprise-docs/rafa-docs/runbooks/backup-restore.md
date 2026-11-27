# Runbook — Backup and Restore (SQLite + Litestream phase)

## Verify backups exist
- Newest object in the bucket: snapshots < 26 h, WAL generations recent.
- Backup job heartbeat monitor is green.

## Restore to a new volume (RTO target 1 h)
1. Enable maintenance/read-only mode or stop the API.
2. Provision a clean volume/instance; set Litestream credentials.
3. `litestream restore -o /data/rafa.db <replica-url>` (add `-timestamp <ISO>` for point-in-time).
4. `sqlite3 /data/rafa.db "PRAGMA integrity_check; PRAGMA foreign_key_check;"` → expect `ok` and no rows.
5. Compare row counts of key tables with last known metrics.
6. Start the API (migrations run if needed), check `/health/ready`, run smoke tests.
7. Re-enable writes; keep the damaged volume for forensics for 14 days.

## Monthly drill
Restore into staging, time every step, record in `docs/restore-drills.md`, fix gaps (credentials, docs, scripts).

## Postgres phase
Use provider PITR to create a new instance at a timestamp, verify, switch `DATABASE_URL`, rotate credentials.
