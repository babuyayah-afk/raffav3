# 13 — Feature Checklist and Staged Roadmap

## 1. Features every production system should have

### Security and trust
- [ ] HTTPS everywhere + HSTS, strict CSP, security headers
- [ ] Real admin auth: unique accounts, Argon2id, MFA, session cookies, lockout, audit log
- [ ] Tiered rate limiting + auto-ban + Turnstile + honeypot
- [ ] Input validation on every route (Zod, strict), output encoding, parameterized SQL
- [ ] Secrets management and rotation procedure; secret scanning in CI
- [ ] Dependency scanning and automated update PRs
- [ ] Role-based access control, least privilege, PII masking in admin
- [ ] Encrypted backups and tested restores

### Reliability and performance
- [ ] Health/readiness/liveness endpoints
- [ ] Graceful shutdown, supervisor restart, crash-loop protection
- [ ] Circuit breakers, timeouts, retries with jitter, bulkheads
- [ ] Outbox with dead-letter handling and admin retry
- [ ] Load shedding, concurrency caps, request deadlines
- [ ] Feature flags, maintenance mode, read-only mode
- [ ] CDN caching, compression, image/video optimization, hashed assets
- [ ] Offline-tolerant frontend with default content fallbacks

### Operations
- [ ] Structured logs with request IDs, PII redaction
- [ ] Metrics, dashboards, SLOs, alerting with runbooks
- [ ] Error tracking (frontend + backend) with release tagging
- [ ] Uptime monitoring + public status page
- [ ] Staging environment, CI/CD with gates, one-click rollback
- [ ] Migrations with versioning and rollback strategy
- [ ] Backup freshness monitoring and monthly restore drill

### Business and customer experience
- [ ] Enquiry pipeline: statuses, assignment, notes, SLA timers, email/SMS alerts to staff
- [ ] Auto-acknowledgement email to customers with reference number
- [ ] Newsletter double opt-in, preferences, unsubscribe, suppression list
- [ ] Admin content editing with preview, validation, versioning (undo) and publish
- [ ] Orders: quote → pay → fulfil → refund, receipts, stock reservations
- [ ] Customer order-status page (signed link) and notifications
- [ ] Search/filter in admin, CSV export (rate-limited, audited)
- [ ] Accessibility (WCAG 2.2 AA), SEO basics, analytics (privacy-friendly)
- [ ] Legal pages, consent records, data-subject request tooling
- [ ] WhatsApp/phone click-to-contact fallback on every form

### Developer experience
- [ ] One-command local setup (`npm run dev`), seed data, `.env.example`
- [ ] OpenAPI spec, architecture docs kept in repo, ADRs
- [ ] Linting/formatting, pre-commit hooks, conventional commits, changelog
- [ ] Test suite with coverage thresholds; load and chaos test scripts

## 2. Staged roadmap

### Stage 0 — Stabilize and secure the current build (1–2 weeks)
1. Add `config/env.js` validation, `security.js` (Helmet/CORS/headers), error contract, request IDs, pino logging.
2. Tiered rate limits, honeypot, Turnstile on contact/newsletter; body caps; timeouts.
3. SQLite pragmas, migrations runner, Litestream backups, health endpoints, graceful shutdown.
4. CSP in report-only → enforce; remove inline scripts/styles; `_headers` on Netlify.
5. Harden admin token handling (timing-safe, strict limiter, no persistence) and move admin to its own subdomain.
6. CI: lint, tests, audit, gitleaks, build allowlist check.
**Exit:** security header grade A, backups restoring, tests green.

### Stage 1 — Reliability and operations (2–3 weeks)
1. Outbox + worker + staff email alerts + customer acknowledgements.
2. Circuit breakers, feature flags, maintenance/read-only modes.
3. Sentry, metrics, dashboards, uptime checks, status page, alert routing.
4. Frontend: `api.js` wrapper with timeout/retry, content caching, offline fallbacks, image pipeline (AVIF/WebP), Lighthouse budgets in CI.
5. Staging environment; load + chaos tests; runbooks rehearsed.
**Exit:** SLO dashboards live; failure drills pass.

### Stage 2 — Real admin and data governance (2–3 weeks)
1. Admin users, MFA, roles, sessions, audit log; remove shared token.
2. Admin enquiry workflow (assign, notes, SLA), exports, PII masking.
3. Retention jobs, data-subject request tooling, privacy documents live.
4. Content versioning and preview.

### Stage 3 — Commerce foundation (4–8 weeks, after business rules confirmed)
1. Migrate to PostgreSQL; repositories + migrations; pooling; PITR backups.
2. Product/variant/stock model; server-side pricing and quote endpoint; delivery zones.
3. Order state machine, reservations, idempotency keys.
4. Payment provider integration in **sandbox**; webhook handling, reconciliation, refunds.
5. Remove demo payment UI; add policies at checkout; penetration test.
**Exit:** all acceptance criteria in doc 07 section 12.

### Stage 4 — Events and desserts operations (parallel/after)
1. Celebration pipeline: qualification → quote → contract → deposit via payment layer.
2. Dessert capacity calendar, lead times, slots.
3. Notifications by SMS/WhatsApp where useful.

### Stage 5 — Scale and optimize
Redis for limits/queue, separate worker, read-through caching, multi-instance, regional edge caching, advanced analytics, A/B testing with consent.

## 3. Launch gate (all must be true)

- [ ] Security: headers A, ZAP baseline clean, authz review done, secrets rotated, MFA on all staff accounts
- [ ] Rate limits and bot defence verified in staging by simulated abuse
- [ ] Backups restored successfully within RTO; backup alerts working
- [ ] Failure drills passed (email down, DB busy, process crash, deploy rollback)
- [ ] Lighthouse/CWV budgets met on a real mid-range Android over 4G
- [ ] Accessibility audit passed; legal pages and consent flows live
- [ ] Monitoring, alerting and on-call contacts verified end to end
- [ ] Demo data/claims (prices, metrics, testimonials) replaced or labeled; demo checkout removed or clearly marked
- [ ] Runbooks reviewed; rollback rehearsed

## 4. Open decisions to close with the business (from the brief)

Launch services (events/desserts/apparel), markets and currencies, payment providers and fees, delivery zones/pricing, stock ownership, dessert lead times/capacity, notification channels, data retention periods, support hours and SLAs.
