# 04 — Resilience, Error Handling and Self-Healing

Objective: when something breaks, the site keeps serving what it can, customers never lose a submission, the developer
gets precise evidence and **time** to fix, and the process recovers automatically where recovery is safe.

## 1. Honest definition of "self-healing"

| Fault class | Behavior |
|---|---|
| Expected/operational (bad input, provider timeout, DB busy, 429) | Handle in code, return a typed error, retry or queue. No restart. |
| Dependency down (email, SMS, PSP, media CDN) | Circuit breaker opens, work goes to outbox, feature degrades, alert fires. |
| Overload | Shed load (503 + Retry-After), serve cache, protect core routes. |
| Programmer error / unknown state (`uncaughtException`, `unhandledRejection`) | Log fully, stop accepting connections, finish in-flight requests (timeout 10 s), **exit non-zero** so the supervisor starts a clean process. Continuing in an unknown state risks data corruption. |
| Host failure | Health-check driven restart/replace; DB restored from replicated backup. |

Crash-loop protection: supervisor backoff (Docker `restart: on-failure:5`, systemd `RestartSec` with `StartLimitBurst`, PaaS defaults). After the limit, hold in a **maintenance mode** rather than flapping, and page the developer.

## 2. Error contract (every endpoint)

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Too many requests. Please try again later.",
    "requestId": "01J...",
    "retryAfter": 120,
    "fields": { "email": ["Enter a valid email address"] }
  }
}
```

- Stable machine `code`s: `VALIDATION_FAILED`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA_TYPE`, `DEPENDENCY_UNAVAILABLE`, `OVERLOADED`, `INTERNAL`.
- Never include stack traces, SQL, file paths, or provider payloads in responses.
- The `requestId` is returned and logged so a customer report maps to one log trace.
- Custom `AppError(code, status, message, {cause, expose})` class; the central `errorHandler` is the only place that formats errors (`reference-code/errorHandler.js`).
- Async route wrapper (or Express 5) so rejected promises always reach the handler.

## 3. Timeouts, retries, breakers

- Every outbound call gets a timeout (`AbortSignal.timeout(ms)`): email 5 s, SMS 5 s, PSP initiate 10 s, PSP query 8 s.
- Retries only for idempotent operations, with exponential backoff + full jitter, max 3 attempts, and a retry budget.
- Circuit breaker (`reference-code/circuitBreaker.js`): open after 5 consecutive failures or >50% failures in 30 s, half-open probe after 30 s. Open breaker → immediate fallback (queue) instead of piling up slow requests.
- Bulkheads: separate concurrency limits per integration so a slow SMS vendor cannot starve email or checkout.

## 4. Outbox pattern (never lose a lead)

```
BEGIN;
  INSERT INTO contact_inquiries ...;
  INSERT INTO outbox(type, payload, run_at, attempts, status) VALUES ('email.staff_alert', ..., now, 0, 'pending');
COMMIT;                          -- customer gets 201 here
worker: SELECT ... WHERE status='pending' AND run_at <= now ORDER BY run_at LIMIT 20;
        send → mark 'done'  |  fail → attempts+1, run_at = now + backoff, after N → 'dead' + alert
```

- Worker runs in-process initially (setInterval with guard against overlap); separate process when volume grows.
- Idempotent handlers (dedupe key per message) so retries never double-send.
- `dead` rows appear in the admin UI with a "retry" button.
- Retention: delete `done` rows after 14 days.

## 5. Graceful degradation matrix

| Component down | Customer sees | System does |
|---|---|---|
| API entirely | Static pages and default content still render; forms show "temporarily unavailable, WhatsApp/call us" with contact fallback | Alert; Cloudflare "Always Online"/custom error page; contact links stay on the page |
| `site-content` endpoint slow | Default in-page content (already designed this way) | Short timeout (2.5 s) in `publicContent.js`; cached copy in `localStorage`/Cache API with `stale-while-revalidate` |
| DB locked/busy | Retry within `busy_timeout`, then 503 + `Retry-After` | Alert if sustained |
| Email provider | Form succeeds | Outbox retries; staff alerted through second channel |
| Turnstile | Form allowed under stricter rate limit | Log degraded mode |
| Payment provider | Checkout shows "payments unavailable, order saved as pending / pay on request" | Breaker open; no order loss |
| Media CDN | Placeholder images with `onerror` fallback | Alert |

## 6. Frontend self-protection

- `fetch` wrapper with `AbortController` timeout, retry-once on network error for GETs, never auto-retry POSTs without an idempotency key.
- Preserve form input across failures; offer "copy your message" if the API is down.
- Global `window.onerror`/`unhandledrejection` reporter to Sentry (rate-limited, PII-free).
- Defaults always in HTML so the page works without JS data (progressive enhancement).
- Service worker (optional, doc 08) serves last-known content when offline.

## 7. Health, readiness, liveness

| Endpoint | Checks | Used by |
|---|---|---|
| `GET /health/live` | process responds | supervisor restart decision |
| `GET /health/ready` | DB `SELECT 1`, disk space > 10%, migrations current, event-loop lag OK | load balancer routing |
| `GET /health/deps` (admin only) | breaker states, outbox depth, last backup time | dashboards |

Readiness failing removes the instance from rotation **without** restarting it, giving the developer time to inspect.

## 8. Maintenance mode and kill switches

- `FEATURE_FLAGS` table/env: `checkout_enabled`, `contact_enabled`, `newsletter_enabled`, `admin_writes_enabled`, `maintenance_mode`.
- Toggling a flag takes effect without deploy (poll DB every 10 s). Disabled features return `503 FEATURE_DISABLED` with friendly text; the frontend hides the form and shows alternatives.
- Read-only mode: all writes blocked, reads OK — useful during DB restore or investigation.

## 9. Graceful shutdown (deploys and restarts)

On `SIGTERM`: mark not-ready, stop accepting new connections, wait for in-flight (≤ 10 s), stop worker after the current batch, checkpoint SQLite WAL, close DB, exit 0. Force-exit timer at 15 s. See `reference-code/server.js`.

## 10. Giving the developer time and evidence

- Every incident captures: requestId, release SHA, route, sanitized payload shape, stack, breaker states, event-loop lag, memory, DB stats.
- Sentry grouping + release tracking; alerts routed to phone (Telegram/WhatsApp/Pushover) with severity levels.
- Feature flags + read-only mode allow containing the blast radius first, fixing second.
- Rollback in one click (Netlify deploy restore; API image tag redeploy). Practice it.
