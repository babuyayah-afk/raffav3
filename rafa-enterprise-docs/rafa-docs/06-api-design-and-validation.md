# 06 — API Design, Validation and Conventions

## 1. Conventions

- Base path `/api/v1/...` (version from day one; keep current routes as aliases until the frontend is migrated).
- JSON only (`Content-Type: application/json`, else 415). UTF-8. Dates ISO-8601 UTC. Money as `{ "amountMinor": 450000, "currency": "KES" }`.
- Resource-oriented nouns, plural: `/contact-inquiries`, `/celebration-requests`, `/order-requests`, `/newsletter-subscriptions`.
- Methods: `GET` safe, `POST` create, `PATCH` partial update (status changes), `DELETE` rare. No state change on GET.
- Status codes: `201` created, `200` ok, `202` accepted (queued), `204` no body, `400` malformed, `401`, `403`, `404`, `409` conflict, `413`, `415`, `422` validation (pick one of 400/422 and stay consistent), `429`, `503`.
- Pagination: cursor-based (`?limit=25&cursor=...`), `limit` max 100; response `{ data: [...], nextCursor }`.
- Filtering/sorting only on allowlisted indexed fields.
- Idempotency: `Idempotency-Key` header on every public `POST` that creates something or moves money; store key + request hash + response for 24 h; same key + same body → replay the stored response; same key + different body → `409`.
- Correlation: accept `X-Request-Id` (validate format) or generate; echo in response and logs.
- CORS: exact origins from env (`ALLOWED_ORIGINS`), methods and headers allowlisted, `credentials` only for admin origin.

## 2. Validation (Zod)

```js
import { z } from 'zod';

export const contactInquirySchema = z.object({
  topic: z.enum(['events', 'desserts', 'apparels']),
  detail: z.string().trim().min(1).max(120),         // topic-specific choice
  message: z.string().trim().max(2000).optional(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(254),
  phone: z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/).optional(),
  website: z.string().max(0).optional(),              // honeypot
  turnstileToken: z.string().min(10).max(2048),
  formStartedAt: z.string().max(200),                 // signed timestamp
}).strict();
```

Rules: `.strict()` everywhere; normalize before storing; cross-field rules in `.superRefine`; share enum constants between
validator and DB `CHECK`s; for topic-specific `detail`, validate against the allowed list for the chosen topic.

## 3. Endpoint catalogue (target)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/health/live`, `/health/ready` | none | Probes |
| GET | `/api/v1/site-content` | none | `Cache-Control: public, max-age=60, stale-while-revalidate=300`, ETag |
| POST | `/api/v1/contact-inquiries` | Turnstile | 201 `{id}`; dedupe; outbox email |
| POST | `/api/v1/celebration-requests` | Turnstile | Wire to the events form `[VERIFY which form]` |
| POST | `/api/v1/order-requests` | Turnstile | Dessert request, not a sale |
| POST | `/api/v1/newsletter-subscriptions` | Turnstile | Always `202`, identical for existing emails |
| GET | `/api/v1/newsletter-subscriptions/confirm` | token | Double opt-in |
| POST | `/api/v1/newsletter-subscriptions/unsubscribe` | signed token | One-click, no login |
| POST | `/api/v1/checkout/quote` | none | Server recomputes prices + delivery |
| POST | `/api/v1/orders` | idempotency key | Creates `pending_payment` order |
| POST | `/api/v1/payments/mpesa/stk` | order token | Initiates STK push |
| POST | `/api/v1/webhooks/mpesa/:secret` | IP allowlist + secret + re-query | Provider callback |
| POST | `/api/v1/webhooks/psp` | HMAC signature | Aggregator callback |
| GET | `/api/v1/orders/:publicId` | signed order token | Customer status page |
| `*` | `/api/v1/admin/...` | session + role | Records, content, exports |

## 4. Response shaping and privacy

- Explicit DTO mappers per resource; never return DB rows directly.
- Customer-facing responses never include internal IDs that are guessable; use ULIDs or random public IDs (`ord_8F3K...`).
- Admin lists mask PII by default (e.g. `j***@gmail.com`) with a "reveal" action that is audit-logged.

## 5. Caching and conditional requests

- Public GETs: `ETag` + `Cache-Control`; honor `If-None-Match` → `304`.
- Compress with brotli at the edge (Cloudflare) and gzip at origin (`compression` middleware with threshold 1 KB, skip already-compressed types).
- Admin and any personalized responses: `Cache-Control: no-store`.

## 6. Documentation

- Generate OpenAPI 3.1 from the Zod schemas (`zod-to-openapi`) and publish to `docs/openapi.yaml`; CI fails if routes and spec drift.
- Contract tests use the spec; the frontend `api.js` mirrors it.

## 7. Backward compatibility policy

Additive changes are non-breaking. Breaking changes create `/v2`; `/v1` stays at least 6 months after the frontend moves.
