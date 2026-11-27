# 02 — Security Architecture

## 1. Threat model (STRIDE-lite)

| Asset | Threat | Primary controls |
|---|---|---|
| Admin access | Token theft (XSS, leaked env, shoulder surf), brute force | Real auth + MFA, cookies not storage, lockout, CSP, audit log |
| Customer PII (names, emails, phones, addresses) | Leak via injection, over-broad API, backups, logs | Parameterized SQL, field allowlists, encryption at rest/in transit, log redaction |
| Payments | Spoofed callbacks, replay, amount tampering | Server-side amounts, callback authentication + re-query, idempotency |
| Availability | Floods, slowloris, expensive queries, form spam | Edge + app rate limits, timeouts, body caps, load shedding |
| Content integrity | Unauthorized edit of site content, stored XSS | Role checks, sanitize/escape on render, CSP |
| Supply chain | Malicious npm packages | Lockfile, pinned versions, audit, minimal deps |
| Secrets | Commit to git, public env vars | Secret scanning, host secret store, rotation runbook |

## 2. Transport and edge

- HTTPS only; HSTS `max-age=63072000; includeSubDomains; preload` (after confirming all subdomains are HTTPS).
- TLS 1.2+; let Cloudflare/Netlify manage certificates.
- Cloudflare: enable managed WAF rules, "Bot Fight Mode", challenge on suspicious `/api/*` POSTs, and lock the origin
  so the API only accepts traffic from Cloudflare (origin allowlist or Authenticated Origin Pulls / Tunnel).
- Put the API behind `trust proxy` configured to the exact number of hops so `req.ip` is real (rate limits depend on it).

## 3. HTTP security headers

Frontend (Netlify `_headers` / `netlify.toml`) and API (Helmet). See `reference-code/netlify-headers.txt` and
`reference-code/security.js`. Essentials:

- `Content-Security-Policy`: `default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: https://<media-cdn>; connect-src 'self' https://<api-origin>; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests`.
  Avoid `'unsafe-inline'`. Move inline `<script>`/`style=""` into files or use nonces/hashes. Roll out in
  `Content-Security-Policy-Report-Only` first.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self)`.
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-site`.
- Admin pages: `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`.

## 4. Authentication and authorization

### Implemented account-based admin authentication

- Owners provision individual username/password accounts through `npm run admin:create` (first owner) and the admin **Authentication** page (additional accounts). Usernames are normalized and unique; passwords are hashed with Argon2id (19 MiB memory, t = 2, p = 1).
- TOTP MFA is required. Authenticator secrets are encrypted with AES-256-GCM using `RAFA_AUTH_ENCRYPTION_KEY`; one-time recovery codes are stored as hashes.
- Sessions use a random 256-bit ID; only its SHA-256 hash is stored in SQLite. The browser receives an HttpOnly, SameSite=Strict cookie, with a 30-minute idle timeout and 12-hour absolute lifetime. In production the cookie is Secure. Session IDs rotate after MFA verification/enrollment.
- Admin mutations require a configured Origin and `X-Requested-With` header. Credentialed CORS uses the exact `FRONTEND_ORIGINS` allowlist.
- Roles are `owner`, `manager`, `support`, and `viewer`. Owners manage accounts; owners/managers edit website content; support can read records and update statuses; viewers are read-only. Permissions are enforced by API middleware, not only by the UI.
- Owners can disable accounts or reset another user's MFA. The final active owner cannot be removed or demoted. MFA reset revokes the affected account's sessions and recovery codes.
- Website Content uses the same authenticated admin session; it does not use a separate bearer token.
- Because the cookie is `SameSite=Strict`, host the admin and API on same-site origins or reverse-proxy the API through the admin site. Unrelated provider hostnames may block the browser session cookie.
- Back up `RAFA_AUTH_ENCRYPTION_KEY` securely. Losing it prevents decryption of enrolled authenticator secrets. Key rotation requires a coordinated re-encryption migration; do not replace the key as a routine environment-only change.
- Serve the admin and API over HTTPS, ideally with a restrictive CSP and an IP allowlist or Cloudflare Access if staff IPs are stable.

### Remaining hardening

- Add an append-only audit log for account and content changes, and a tested encryption-key rotation procedure before rotating the application key.
- Establish password reset/change and account recovery procedures appropriate for production operations.

## 5. Input handling

- Validate with Zod on every route: `.strict()` objects (reject unknown keys), max lengths, enums, normalized email/phone.
- Body limits: `100kb` default JSON, `10kb` for public forms; reject other content-types with 415.
- SQL: only prepared statements/parameter binding; no string concatenation. Lint for template-literal SQL.
- Output: never `innerHTML` with server/user text. Use `textContent` or a vetted sanitizer (DOMPurify) for any rich content
  editors produce in the admin (homepage cards, testimonials). Store plain text or sanitized HTML, sanitize again on render.
- URLs from admin content (images, links): allow only `https:` and relative paths; reject `javascript:`/`data:` (except images if intended).
- File uploads (when added): presigned direct-to-storage uploads, MIME sniffing + extension allowlist, size cap, re-encode images, random keys, no executable types, malware scan if user-generated content is allowed.

## 6. Secrets and configuration

- All secrets via env vars validated at boot (`config/env.js`); process exits with a clear message if missing/weak.
- `.env` in `.gitignore`; enable GitHub secret scanning and push protection; add `gitleaks` to CI.
- Never expose secrets as `VITE_`/public variables or in `<meta>` tags. Only the API base URL is public.
- Separate secrets per environment; least-privilege API keys (e.g., email key limited to sending).
- Rotate on suspicion immediately; keep a documented inventory (what, where, owner, rotation date).

## 7. Data protection

- Encryption at rest: provider disk encryption + encrypted backups (age/GPG key held offline). For especially sensitive fields (TOTP secrets, any tokens) use application-level AES-256-GCM with a key from env.
- Minimize: collect only what the form needs; no card data ever touches your servers (doc 07).
- Redact logs: strip `email`, `phone`, `authorization`, `cookie`, tokens (`pino` `redact`).
- Access: DB file permissions `0600`, dedicated OS user, no shell for the service user.

## 8. Application hardening checklist

- [ ] `helmet` + custom CSP, `hpp`, CORS exact-origin allowlist (no `*`, no reflecting `Origin`)
- [ ] `app.disable('x-powered-by')`, `app.set('trust proxy', N)`
- [ ] JSON parser `strict: true`, `limit` set; no `bodyParser.urlencoded({extended:true})` unless needed
- [ ] Generic error messages to clients; details only in logs
- [ ] Constant-time comparisons for secrets/tokens
- [ ] `Number`/length checks before any DB call; pagination caps (`limit ≤ 100`)
- [ ] Response field allowlists (never `SELECT *` into responses)
- [ ] SSRF guard on any server-side fetch of user-supplied URLs (none planned; keep it that way)
- [ ] Dependency policy: `npm ci`, `npm audit --omit=dev` in CI, Renovate weekly, remove unused packages
- [ ] Node run as non-root; read-only filesystem except data/tmp in containers
- [ ] Disable directory listing; no source maps with secrets in production

## 9. Self-protective behaviors (summary; details in docs 03 and 04)

- Auto-ban IPs after repeated 4xx/validation/auth failures within a window (temporary, escalating).
- Honeypot + Turnstile + minimum fill time on forms; silent accept-and-drop for honeypot hits.
- Load shedding when event-loop lag > 200 ms: public read routes served from cache, writes get 503 + `Retry-After`.
- Circuit breakers around providers; fall back to outbox queueing.
- Kill switches (feature flags) to disable a route group instantly without redeploying.
- Canary tokens: a fake admin route (`/api/admin/backup.sql`) that alerts and bans on access.

## 10. Verification

- OWASP ASVS Level 2 as the target checklist; OWASP Cheat Sheet Series for each control.
- Automated: `npm audit`, ZAP baseline scan against staging, `eslint-plugin-security`, header scans (securityheaders.com, Mozilla Observatory).
- Manual: pre-launch review of authz on every admin route; penetration test before payments go live.
