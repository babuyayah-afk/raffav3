# 03 — Rate Limiting and Abuse Protection

Goal: keep the site usable for real customers while attackers and bots hit a wall that costs *them* effort, not you.

## 1. Defence in depth

| Layer | Tool | Catches |
|---|---|---|
| L0 Edge network | Cloudflare DDoS protection | Volumetric floods |
| L1 Edge rules | Cloudflare rate-limiting rules + WAF + bot score | Credential stuffing, scrapers, known bad IPs |
| L2 Human check | Turnstile on contact, newsletter, checkout start, admin login | Scripted form spam |
| L3 App limiter | `express-rate-limit` (Redis store when scaled) | Per-IP / per-identifier abuse |
| L4 Behavioural | Auto-ban middleware, honeypot, time-to-submit | Low-and-slow abuse |
| L5 Resource protection | Load shedding, request timeouts, concurrency caps | Expensive or slow requests |
| L6 Business rules | Per-email/per-phone caps, duplicate detection | Targeted harassment/spam |

## 2. Limit table (starting values — tune from logs)

| Route group | Key | Limit | Window | On exceed |
|---|---|---|---|---|
| `GET /health` | IP | 60 | 1 min | 429 |
| `GET /api/site-content` | IP | 120 | 1 min | 429; edge-cache 60 s to absorb load |
| `POST /api/contact-inquiries` | IP | 5 | 15 min | 429 + `Retry-After` |
| same | email (hashed) | 3 | 1 h | 429 |
| `POST /api/celebration-requests` | IP | 5 | 15 min | 429 |
| `POST /api/order-requests` | IP | 5 | 15 min | 429 |
| `POST /api/newsletter-subscriptions` | IP | 5 | 1 h | 429 (response identical for existing emails) |
| `/api/admin/*` (all) | IP | 100 | 1 min | 429 |
| Admin login / token check failures | IP | 10 | 15 min | 429 then 1 h ban |
| Payment initiate (future) | IP + order | 5 | 10 min | 429 |
| Payment callbacks (future) | none (IP allowlist) | generous | — | verify, don't rate-limit legit provider |

Return headers: `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset`, `Retry-After` (standard headers; set `standardHeaders: 'draft-7'`).

## 3. Implementation notes

- All constants live in `config/limits.js` so ops can retune without hunting code.
- Use `keyGenerator` that reads `req.ip` (with correct `trust proxy`). Behind Cloudflare, trust `CF-Connecting-IP` **only** if the origin accepts traffic from Cloudflare exclusively; otherwise it is spoofable.
- Memory store is fine for one instance; switch to `rate-limit-redis` before running two instances, otherwise limits multiply by instance count.
- IPv6: limit on /64 prefixes, not single addresses (the library's `ipKeyGenerator` helper handles this in current versions `[VERIFY version docs]`).
- Failure mode: if the limiter store errors, **fail open for public GETs, fail closed for admin and writes** (`passOnStoreError` per limiter).
- Different limiter instances per route group; do not share a single global bucket.

## 4. Auto-ban (escalating)

Track offences per IP (429s, failed auth, validation failures above a threshold, honeypot hits, canary hits).

| Strike | Ban |
|---|---|
| 1st breach | 15 min |
| 2nd within 24 h | 1 h |
| 3rd within 24 h | 24 h |
| canary route hit | 24 h immediately |

Bans live in memory with TTL (single node) or Redis (multi-node); push persistent offenders to a Cloudflare IP list via API.
Always expose a way to unban (admin endpoint or runbook) because shared mobile-carrier IPs (CGNAT) are common in Kenya —
use **short** bans and prefer challenges (Turnstile) over hard blocks for ambiguous cases.

## 5. Bot and spam defence for forms

1. Cloudflare Turnstile token verified server-side (`siteverify`) with a 2-second timeout; if Turnstile is down, fall back to stricter limits rather than blocking everyone.
2. Honeypot field (`website`) — if filled, return `200` and discard.
3. Minimum time-to-submit (e.g. 3 s) using a signed timestamp issued with the page or form load.
4. Content heuristics: reject messages with >2 links, known spam keywords, or repeated identical payloads (hash and dedupe within 24 h).
5. Disposable-email domain list for newsletter (optional).
6. Double opt-in for newsletter (also a legal safeguard).

## 6. Resource protection

- `requestTimeout` middleware: 10 s for public routes, 30 s for admin exports; abort and release.
- Node server settings: `server.headersTimeout = 15000`, `server.requestTimeout = 30000`, `server.keepAliveTimeout = 65000` (above load balancer idle timeout), `server.maxHeadersCount = 50`.
- Concurrency cap (`maxInFlight`, e.g. 200) with 503 + `Retry-After: 5` beyond it.
- Event-loop lag monitor (`perf_hooks.monitorEventLoopDelay`) drives load shedding (`reference-code/loadShed.js`).
- Pagination hard caps; admin list endpoints use indexed filters only; export endpoints stream and are limited to 1/min.
- Regex hygiene: no user-controlled regex; avoid catastrophic patterns (ReDoS) — prefer `validator`/Zod built-ins.

## 7. Monitoring the defences

Alert when: 429 rate > 5% of requests for 10 min; auto-ban count spikes; Turnstile failure rate spikes; any canary hit; admin login failures > 20/10 min.
Dashboards: requests by status, top limited IPs/routes, p95 latency, shed count.

## 8. Customer-friendly behavior

- Frontend shows a clear message on 429 ("Too many attempts, try again in N minutes") using `Retry-After`; keeps the form data.
- Do not reveal which defence triggered; keep errors generic for abusers, helpful for humans.
