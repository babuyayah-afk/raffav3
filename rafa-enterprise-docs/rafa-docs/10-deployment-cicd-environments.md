# 10 — Deployment, CI/CD and Environments

## 1. Environments

| Env | Purpose | Data | Frontend | API |
|---|---|---|---|---|
| local | development | seeded fake data | `localhost` static server | `localhost:3001` |
| staging | pre-release, QA, security scans, payment sandbox | synthetic data only | Netlify branch/deploy preview | separate API instance + own DB + sandbox keys |
| production | customers | real | Netlify production | production API + volume/managed DB |

Never copy production PII to staging; use anonymized fixtures.

## 2. Configuration (12-factor)

- All config from env vars, validated at boot (`config/env.js`). Missing/invalid → exit with clear message.
- Required by the current API: `NODE_ENV`, `PORT`, `FRONTEND_ORIGINS`, `RAFA_AUTH_ENCRYPTION_KEY`, and optionally `DATABASE_PATH`. Other keys in this document (`TURNSTILE_SECRET`, `EMAIL_API_KEY`, `SENTRY_DSN`, `TRUST_PROXY_HOPS`, `RELEASE_SHA`) are future deployment recommendations, not current API configuration.
- Create the initial admin owner with `npm run admin:create` after configuring the API environment. Do not configure a shared admin password/token in hosting or frontend settings.
- Payments later: provider keys, webhook secrets, callback secret path.
- `.env.example` lists every key with comments, never real values.
- Frontend config: only `rafa-api-base` meta (injected per environment during build).

## 3. API hosting options

| Option | Fit |
|---|---|
| Fly.io (Docker + volume) | Good for SQLite phase (one machine + volume), region near Nairobi (e.g. Johannesburg/Europe `[VERIFY nearest region]`) |
| Render / Railway | Simple; persistent disk available `[VERIFY plan]` |
| VPS (Hetzner/DigitalOcean/Linode) + Docker + Caddy | Cheapest control, you manage OS patching |
| Managed Postgres + PaaS | Phase 2 onwards |

Latency note: pick a region with good connectivity to Kenya; Cloudflare in front reduces perceived latency for static/cached content.

## 4. Container

```dockerfile
FROM node:22-alpine AS deps
WORKDIR /app
COPY backend/package*.json ./
RUN npm ci --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app && mkdir -p /data && chown app:app /data
COPY --from=deps /app/node_modules ./node_modules
COPY backend/ ./
USER app
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1:3001/health/live || exit 1
CMD ["node", "--max-old-space-size=384", "server.js"]
```

Pin base image digests, rebuild weekly for OS patches, scan with Trivy/Grype in CI. `[VERIFY the current Node LTS at build time]`.

## 5. CI pipeline (GitHub Actions)

On every PR:
1. `npm ci`
2. Lint (`eslint`, `eslint-plugin-security`), format check
3. Unit + integration tests (with coverage threshold)
4. `npm audit --omit=dev --audit-level=high`
5. `gitleaks` secret scan
6. Build (`npm run build`) and verify `dist/` allowlist contents
7. Lighthouse CI on built pages (performance/accessibility budgets)
8. Playwright smoke tests (contact form, newsletter, cart)
9. Container build + Trivy scan

On merge to `main`: deploy staging → run ZAP baseline + smoke tests → manual approval → deploy production → post-deploy smoke test → tag release in Sentry.

Branch protection: required reviews/checks, signed commits optional, no direct pushes to `main`.

## 6. Release strategy

- Frontend: Netlify atomic deploys; instant rollback by restoring a previous deploy.
- API: rolling or blue-green; migrations run first (backward-compatible), then code. Keep previous image for one-command rollback.
- SQLite phase single instance: brief restart (seconds) on deploy; graceful shutdown (doc 04) and readiness gating minimize impact. Schedule deploys off-peak.
- Feature flags to ship dark and enable gradually.

## 7. Netlify specifics

- `netlify.toml`: publish `dist/`, build command `npm run build`, headers (doc 02/08), redirects for legacy pages and admin URL.
- Deploy previews use the staging API base; production uses production origin. Inject via build env.
- Restrict admin: separate site/subdomain, optional Netlify password/Cloudflare Access `[VERIFY plan features]`.
- Functions are optional; keep business logic in the API for one place to harden.

## 8. DNS and domains

- Cloudflare DNS; `www` → apex (or reverse) canonical redirect; `api.<domain>` proxied; `admin.<domain>` separate; CAA records; DNSSEC; SPF, DKIM, DMARC (start `p=none`, move to `quarantine`/`reject`) for email deliverability and anti-spoofing.

## 9. Disaster recovery

| Scenario | RTO / RPO target | Plan |
|---|---|---|
| API instance dies | RTO 15 min / RPO ~0 (WAL replicated) | Redeploy image, restore from Litestream |
| Bad deploy | RTO 5 min | Roll back image/Netlify deploy |
| DB corruption | RTO 1 h / RPO < 1 min | Restore latest replica to new volume, verify integrity |
| Provider outage | degrade per doc 04 | Outbox + feature flags |
| Compromise | contain first | Rotate secrets, revoke sessions, read-only mode, forensic log capture (runbook) |

Document the above in `runbooks/` and rehearse twice a year.
