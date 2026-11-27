# 01 — System Architecture

## 1. Logical diagram

```
                    ┌───────────────────────────────────────────┐
 Visitors ───────▶  │ Cloudflare: DNS, TLS, WAF, bot score,     │
                    │ edge rate limits, cache, Turnstile        │
                    └───────┬───────────────────────┬───────────┘
                            │ static                │ /api/*
                   ┌────────▼────────┐      ┌───────▼─────────────────────────┐
                   │ Netlify (dist/) │      │ API (Node/Express, 1..n nodes)  │
                   │ HTML/CSS/JS     │      │  security → limits → validate → │
                   │ admin/ app      │      │  service → repository           │
                   └─────────────────┘      │  outbox worker (same process    │
                                            │  initially, separate later)     │
                                            └──┬────────────┬──────────┬──────┘
                                               │            │          │
                                     ┌─────────▼───┐  ┌─────▼────┐ ┌───▼─────────┐
                                     │ SQLite→PG   │  │ Media    │ │ Providers:  │
                                     │ + backups   │  │ storage  │ │ email, SMS, │
                                     └─────────────┘  │ + CDN    │ │ M-Pesa/PSP  │
                                                      └──────────┘ └─────────────┘
```

## 2. Backend layering (strict)

```
backend/src/
├── app.js                  # builds Express app (no listen) — testable
├── server.js               # listen, graceful shutdown, process handlers
├── config/
│   ├── env.js              # parse + validate env with Zod, fail fast on boot
│   └── limits.js           # all rate-limit and size constants in one place
├── middleware/
│   ├── requestId.js
│   ├── security.js         # helmet, cors, hpp, headers
│   ├── rateLimit.js        # tiered limiters + auto-ban
│   ├── loadShed.js         # event-loop-lag based 503
│   ├── timeout.js          # per-request deadline
│   ├── auth.js             # admin session / token check
│   ├── validate.js         # zod wrapper
│   └── errorHandler.js     # single error contract
├── routes/                 # HTTP only: parse → call service → respond
├── services/               # business rules; no SQL, no req/res
├── repositories/           # only layer that touches the DB
├── integrations/           # email, sms, mpesa, psp — each behind an interface + circuit breaker
├── jobs/                   # outbox worker, retention purge, backup check
├── validators/             # zod schemas
└── lib/                    # logger, circuit breaker, idempotency, crypto helpers
```

Rules: routes never contain SQL; services never import `express`; integrations are only called from services or jobs;
nothing outside `config/env.js` reads `process.env`.

## 3. Request lifecycle

1. Edge: WAF, bot score, IP rate limit, Turnstile on forms.
2. `requestId` → structured access log.
3. `security` headers, CORS allowlist, body size cap, content-type check.
4. `loadShed` — if event-loop lag or in-flight count exceeds threshold, return `503 + Retry-After` for non-critical routes.
5. Tiered rate limiter (IP, then account/identifier).
6. `timeout` — hard deadline per request class.
7. Auth (admin routes) and authorization (role).
8. Validate (Zod): reject unknown keys, enforce bounds.
9. Service logic, repository calls inside transactions.
10. Response in the standard envelope; side effects go to the outbox.

## 4. Scaling path (no rewrites)

| Stage | Traffic | Setup |
|---|---|---|
| 1 | up to ~50k visits/mo | 1 small instance, SQLite WAL, Litestream, Cloudflare |
| 2 | payments live | Managed Postgres, still 1–2 API instances, Redis for rate-limit store |
| 3 | campaigns / peaks | 2–4 instances behind load balancer, worker split into own process, queue on Redis (BullMQ) |
| 4 | multi-region (unlikely) | Read replicas, regional edge caching of `/api/site-content` |

Stateless API requirement (needed from stage 2): no in-memory sessions, no local file writes except temp, config via
env, idempotent handlers.

## 5. State boundaries (from the brief, made explicit)

| Object | Authority | Allowed transitions |
|---|---|---|
| Cart/wishlist | Browser only | free |
| Contact inquiry | Server | `new → contacted → qualified → closed/spam` |
| Celebration request | Server | `new → reviewing → quoted → accepted/declined` |
| Dessert order request | Server | `new → confirmed → in_production → ready → fulfilled/cancelled` |
| Order (future) | Server | see doc 07 state machine |
| Payment (future) | Provider-verified callbacks only | `initiated → pending → succeeded/failed/expired` |
