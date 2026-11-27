# Reference code

Working ESM (Node 20+) building blocks referenced by the docs. Copy into `backend/src/` and adapt paths.
Dependencies: `express helmet cors hpp compression express-rate-limit pino pino-http zod better-sqlite3`.
Review and test before production; these are starting points, not a finished product.

| File | Goes to | Doc |
|---|---|---|
| `env.js` | `config/env.js` | 10 |
| `limits.js` | `config/limits.js` | 03 |
| `security.js` | `middleware/security.js` | 02 |
| `rateLimit.js` | `middleware/rateLimit.js` | 03 |
| `loadShed.js` | `middleware/loadShed.js` | 03/04 |
| `errorHandler.js` | `middleware/errorHandler.js` | 04 |
| `adminAuth.js` | `middleware/auth.js` (interim) | 02 |
| `circuitBreaker.js` | `lib/circuitBreaker.js` | 04 |
| `db.js` | `db.js` | 05 |
| `outbox.js` | `jobs/outbox.js` | 04 |
| `idempotency.js` | `middleware/idempotency.js` | 06 |
| `server.js` | `server.js` | 04 |
| `netlify-headers.txt` | `frontend/_headers` (copied to `dist/`) | 02/08 |
