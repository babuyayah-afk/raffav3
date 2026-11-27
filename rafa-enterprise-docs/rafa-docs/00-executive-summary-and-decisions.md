# 00 — Executive Summary and Technology Decisions

## 1. Current state in one paragraph

RAFA is a static frontend (Netlify) with a small Express API storing enquiries, newsletter signups and editable
content in SQLite, plus an admin app with individual accounts, MFA, and role-based access. Cart, checkout, payments, stock, delivery
pricing and notifications are **not** connected. The goal of this pack is to define how to harden what exists and how
to add the missing transactional pieces without a rewrite.

## 2. Recommended stack, layer by layer

| Layer | Use now | Upgrade trigger | Why |
|---|---|---|---|
| Frontend hosting | Netlify (static, CDN) | none | Global CDN, atomic deploys, instant rollback, free TLS |
| CDN / WAF / DDoS | Cloudflare (free/pro) in front of Netlify and API | none | Edge rate limiting, bot scoring, managed WAF rules, TLS, caching |
| API runtime | Node.js current LTS, Express 4/5 | Fastify if CPU-bound limits appear | Team already knows it; I/O-bound workload |
| Language | JavaScript + JSDoc types (`// @ts-check`) | Full TypeScript when contributors grow | Type safety without a build step |
| Validation | Zod (replace hand-written validators gradually) | none | One schema → validation + types + docs |
| Database (phase 1) | SQLite via `better-sqlite3`, WAL mode | Orders/payments go live or >1 API instance | Zero ops, fast, enough for enquiry volume |
| Database (phase 2) | PostgreSQL (Neon, Supabase, RDS, or Fly Postgres) | — | Concurrency, row locks for stock, PITR backups |
| DB backups | Litestream → S3-compatible bucket (phase 1); managed PITR (phase 2) | — | Continuous replication, restore drills |
| Media storage | Cloudinary or Cloudflare R2 / S3 + CDN | — | Keeps binaries out of DB and API; image transforms |
| Email | Resend, Brevo, or Postmark | — | Deliverability, bounce handling, templates |
| SMS / WhatsApp | Africa's Talking (SMS), WhatsApp Business API `[VERIFY]` | — | Kenya-relevant delivery |
| Payments | Safaricom Daraja (STK Push) and/or an aggregator (Paystack, Flutterwave, Pesapal, iPay, DPO) `[VERIFY availability/fees]` | — | See doc 07 |
| Bot defence | Cloudflare Turnstile on public forms | — | Privacy-friendlier than reCAPTCHA |
| Rate limiting | Edge rules (Cloudflare) + `express-rate-limit` (+ Redis store when multi-instance) | Redis when scaling out | Defence in depth |
| Queue / jobs | SQLite/Postgres **outbox table** + in-process worker | BullMQ + Redis when volume grows | Durable without new infrastructure |
| Logging | `pino` JSON logs → Better Stack / Grafana Loki / Datadog | — | Cheap, structured, fast |
| Error tracking | Sentry (free tier) | — | Stack traces, release tracking |
| Uptime | UptimeRobot / Better Stack heartbeat + status page | — | External view of availability |
| Process supervision | Docker restart policy, systemd, or PaaS health checks | — | Clean restart after fatal errors |
| API hosting | Fly.io, Render, Railway, or a small VPS (Hetzner/DigitalOcean) + volume | Autoscaling PaaS later | Needs persistent disk for SQLite |
| CI/CD | GitHub Actions | — | Test → audit → build → deploy |
| Secrets | Host secret store; 1Password/Doppler/Infisical for team | — | Never in git |
| Dependency security | `npm audit`, Dependabot/Renovate, `socket.dev` optional | — | Supply-chain defence |

## 3. Architecture Decision Records (summaries)

**ADR-001 Keep static frontend + separate API.** Static pages are the fastest and safest surface. Dynamic parts are
isolated behind a versioned API. *Trade-off:* CORS and two deployments to manage.

**ADR-002 SQLite first, with a defined exit to Postgres.** SQLite in WAL mode serves hundreds of writes/sec on one
node. It cannot scale horizontally and stock reservation under concurrency is easier in Postgres. All data access goes
through a repository layer (`backend/src/repositories/`) so the swap touches one folder. *Trigger:* before enabling
real payments, or the second API instance, whichever comes first.

**ADR-003 Use account-based admin authentication.** Admins have individual accounts with Argon2id password hashes,
required TOTP MFA, hashed one-time recovery codes, role-based authorization, and short-lived sessions in
`HttpOnly; Secure; SameSite=Strict` cookies. Website Content uses the same session. An append-only audit log remains
future hardening work; implementation details are in doc 02.

**ADR-004 Treat payment confirmation as server-side only.** Orders move to `paid` only from a verified provider
callback/query. Browser success pages are cosmetic (doc 07).

**ADR-005 Outbox pattern for side effects.** Emails, SMS, and staff alerts are rows in an `outbox` table processed
by a worker with retries and backoff. A provider outage never loses a lead or fails a customer request.

**ADR-006 Fail closed on security, fail open on content.** If auth/validation/rate-limit infrastructure errors,
deny. If optional content (site-content API, analytics, third-party widgets) errors, serve defaults (already how
`publicContent.js` behaves).

**ADR-007 Edge first.** Cloudflare absorbs volumetric attacks and bots before they cost API CPU.

## 4. What "done" looks like (launch gates)

- All items in doc 13 section "Launch gate" are green.
- Restore drill completed and timed.
- Load test meets targets in doc 11 (p95 < 300 ms API reads at 50 rps on the smallest instance).
- External security scan (Mozilla Observatory ≥ A, SSL Labs A) and OWASP ZAP baseline clean.
- Privacy notice, terms, returns, delivery policy published; ODPC registration status confirmed `[VERIFY]`.
