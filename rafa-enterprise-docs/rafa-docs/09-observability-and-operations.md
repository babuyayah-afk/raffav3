# 09 — Observability and Operations

## 1. Logging

- Library: `pino` (JSON, low overhead); `pino-http` for access logs with `reqId`.
- Levels: `fatal` (process dying), `error` (request failed unexpectedly), `warn` (degraded, limits, breaker open), `info` (lifecycle, key business events), `debug` (off in prod).
- Redact: `req.headers.authorization`, `cookie`, `*.email`, `*.phone`, `*.token`, `*.password`, bodies of forms.
- Fields: `ts`, `level`, `service`, `env`, `release`, `reqId`, `route`, `status`, `durationMs`, `ip` (truncate/hash after 30 days), `userId` (admin).
- Ship stdout to a hosted aggregator (Better Stack, Grafana Cloud Loki, Datadog); retain 30 days; alert rules on error patterns.
- Never log PII or secrets "temporarily".

## 2. Metrics

Expose Prometheus-format `/metrics` (admin-only or internal network) via `prom-client`:

- HTTP: request count/latency histogram by route+status class, in-flight gauge.
- Limits: `rate_limited_total{route}`, `auto_bans_total`, `shed_total`.
- Runtime: event-loop lag p50/p99, heap used, GC pauses, open handles.
- DB: query duration, busy retries, WAL size, DB file size, integrity check result.
- Outbox: depth, oldest pending age, dead count.
- Dependencies: breaker state, call latency/error rate per provider.
- Business: inquiries/day, newsletter confirmations, orders by state, payment success rate.

## 3. Error tracking

Sentry (Node + browser) with release/commit tags, source maps uploaded privately, `beforeSend` scrubbing PII, sampling for noisy errors, alerts to chat + phone.

## 4. Uptime and synthetic checks

- External pings: `/health/ready`, homepage, `/api/v1/site-content`, contact form endpoint with a test header (flagged, no outbox).
- Multi-region checks (include one from Africa if possible); heartbeat monitors for backup job, outbox worker, retention job.
- Public status page (Better Stack/Instatus/UptimeRobot) linked from the footer.

## 5. SLOs (starting points)

| Service | SLI | SLO |
|---|---|---|
| Public site availability | successful page loads | 99.9% / month |
| API read latency | p95 | < 300 ms |
| API write latency | p95 | < 600 ms |
| Form submission success | non-5xx / valid submissions | 99.5% |
| Outbox delivery | sent within 5 min | 99% |
| Backup freshness | newest backup age | < 26 h (WAL replication < 1 min lag) |

Error budget policy: if the monthly budget is burned, pause feature releases and fix reliability first.

## 6. Alerting policy

| Severity | Examples | Channel | Response |
|---|---|---|---|
| SEV1 | Site down, data loss risk, payments failing, security incident | phone push/call | immediate |
| SEV2 | Degraded feature, outbox dead letters, breaker open > 10 min | chat + SMS | within 1 h business hours |
| SEV3 | Rate-limit spikes, warnings | chat | next business day |

Every alert links to a runbook. Prune alerts that don't need action.

## 7. Operations checklist

Daily: glance at error and limit dashboards. Weekly: dependency PRs, review audit log, integrity check results.
Monthly: restore drill, access review (who has admin/hosting/DNS), cost review. Quarterly: secret rotation, load test, incident review, threat-model update.

## 8. Capacity and cost guardrails

- Hosting budget alerts; cap provider spend (SMS/email) with daily quotas and alerts to prevent abuse-driven bills.
- Log volume caps; sample debug logs.
- Image transformations cached at CDN to avoid repeated compute.

## 9. Admin audit and access hygiene

- Everyone uses unique accounts, MFA on GitHub, Netlify, Cloudflare, DNS registrar, email provider, payment dashboard.
- Principle of least privilege; offboarding checklist (revoke sessions, rotate shared secrets).
- Registrar lock and DNSSEC on; protect the domain — it's the keys to the business.
