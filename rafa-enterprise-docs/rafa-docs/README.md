# RAFA Events — Enterprise Engineering Documentation Pack

Version 1.0 · Audience: lead developer, future contributors, security reviewers, hosting/ops.
Baseline: the repository as described in the *RAFA Events Project Overview and Research Brief*
(static HTML/CSS/JS frontend, Express + SQLite API, separate admin app, Netlify build).

## Design priorities (in order)

1. **Security** — assume hostile traffic from day one.
2. **Abuse resistance and rate limiting** — protect cost, availability and data.
3. **Resilience / self-healing** — degrade gracefully, never take the whole site down, buy the developer time to fix.
4. **Speed and efficiency** — fast first paint, low CPU/memory, small payloads.
5. **Server flexibility** — run on a small VPS, a PaaS, or containers; migrate without rewrites.
6. **Storage friendliness** — bounded growth, retention, compression, cheap backups.
7. **Browser friendliness** — modern standards, accessibility, caching, graceful fallbacks.

## Reading order

| # | Document | Answers |
|---|----------|---------|
| 00 | `00-executive-summary-and-decisions.md` | What to use for every layer, and why (decision table + ADRs) |
| 01 | `01-system-architecture.md` | Components, boundaries, data flow, scaling path |
| 02 | `02-security-architecture.md` | Threat model, controls, headers, auth, secrets |
| 03 | `03-rate-limiting-and-abuse-protection.md` | Tiered limits, bot defence, auto-ban, load shedding |
| 04 | `04-resilience-and-self-healing.md` | Error handling, degradation, circuit breakers, outbox |
| 05 | `05-database-and-storage.md` | SQLite hardening, backups, Postgres migration, media |
| 06 | `06-api-design-and-validation.md` | Conventions, validation, error contract, versioning |
| 07 | `07-payments-orders-and-commerce.md` | M-Pesa/cards, webhooks, idempotency, order state machine |
| 08 | `08-frontend-performance-and-browser.md` | Core Web Vitals, caching, CSP, accessibility, offline |
| 09 | `09-observability-and-operations.md` | Logging, metrics, alerts, SLOs, status |
| 10 | `10-deployment-cicd-environments.md` | Environments, pipeline, rollbacks, config |
| 11 | `11-testing-strategy.md` | Unit/integration/security/load testing |
| 12 | `12-privacy-and-compliance-kenya.md` | Data protection, retention, consent, policies |
| 13 | `13-feature-checklist-and-roadmap.md` | Must-have features and a staged plan |
| — | `runbooks/` | Incident response, backup restore, secret rotation |
| — | `reference-code/` | Working source files to drop into `backend/` and `dist` config |

## Ground rules used throughout

- **Labeled assumptions.** Anything not confirmed by RAFA or a provider is marked `[VERIFY]`.
- **Honest failure semantics.** "Self-healing" here means: isolate the fault, degrade the feature, keep serving
  everything else, record the evidence, and restart cleanly via a supervisor. It does **not** mean continuing to run
  after an unknown corrupted state (see doc 04).
- **Demo data is not business data.** Prices, metrics, testimonials and demo receipts must not be treated as real.
- **Never trust the browser.** Every rule enforced in the UI is enforced again on the server.
