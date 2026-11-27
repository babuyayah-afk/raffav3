# 11 — Testing Strategy

## 1. Pyramid

| Level | Tool | Scope | Run |
|---|---|---|---|
| Unit | Vitest or `node:test` | validators, state machine, money math, helpers | every commit |
| Integration | Supertest + temp SQLite | routes → services → repos; error contract; limits | every PR |
| Contract | OpenAPI schema checks | request/response shapes | every PR |
| End-to-end | Playwright (Chromium, WebKit, Firefox; mobile viewports) | contact, newsletter, cart/checkout demo, admin content edit | PR + nightly |
| Accessibility | axe-core, Lighthouse CI, manual screen reader | all pages | PR + release |
| Security | ZAP baseline, `npm audit`, gitleaks, custom abuse tests | staging | PR + weekly |
| Performance | k6 or autocannon, Lighthouse CI | API and pages | weekly + before launch |
| Chaos / resilience | scripted fault injection | provider/DB failures | monthly + before payments |

## 2. Must-have test cases

**Validation:** unknown keys rejected, oversized bodies 413, wrong content-type 415, boundary lengths, unicode/emoji, SQL-looking and script-looking input stored and returned inert.

**Rate limits:** the 6th contact POST in a window returns 429 with `Retry-After`; limits are per-IP and per-email; spoofed `X-Forwarded-For` does not bypass; auto-ban escalation and unban.

**Auth/admin:** every `/admin` route rejects missing/invalid credentials with 401 and wrong role with 403; timing-safe compare; lockout; session expiry; CSRF.

**Resilience:** DB busy → retry then 503; email provider down → request still `201` and outbox retries; breaker opens/closes; graceful shutdown completes in-flight request; crash → supervisor restart (container test); event-loop-lag shedding returns 503 on writes but serves cached GETs.

**Idempotency:** same key replays response; different body conflict `409`; concurrent duplicates yield one row.

**Payments (sandbox):** success, user cancels, insufficient funds, timeout then query, duplicate callback, replayed callback, amount mismatch, forged callback rejected, out-of-order events.

**Data lifecycle:** retention job deletes expected rows only; unsubscribe suppression persists; export/delete request path works.

**Frontend:** works with API blocked (defaults shown), with slow 3G, with `localStorage` disabled/corrupted, with JS errors in one module not breaking others, keyboard-only flows.

## 3. Load targets (smallest production instance)

| Test | Target |
|---|---|
| `GET /site-content` | 200 rps sustained, p95 < 100 ms (cached) |
| `POST /contact-inquiries` | 20 rps, p95 < 400 ms, 0 lost records |
| Mixed spike | 5× normal for 2 min → shedding engages, no crash, recovery < 1 min |
| Soak | 4 h at 30% peak → no memory growth > 10% |

## 4. Abuse simulations (staging only, with permission)

Credential stuffing against admin login; form flood from many IPs; slowloris; oversized/malformed JSON; ReDoS-style payloads; header injection; path traversal on static routes; CORS misconfiguration probes; webhook forgery. Document results and fixes.

## 5. Quality gates

- Coverage ≥ 80% on `services/`, `validators/`, `lib/`; 100% on the order state machine and money utilities.
- No high/critical `npm audit` findings in production dependencies.
- Lighthouse budgets met; zero axe "serious/critical" violations.
- Penetration test (independent) before enabling payments.
