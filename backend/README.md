# RAFA website management API

The Express API defaults website data and admin authentication to Supabase. SQLite remains available by setting `WEBSITE_DATA_PROVIDER=sqlite` and `ADMIN_AUTH_PROVIDER=sqlite`. With Supabase admin auth, app-managed MFA, session, and step-up state is stored in the separate `ADMIN_AUTH_DATABASE_PATH` SQLite file; the SQLite auth rollback keeps its auth state in `DATABASE_PATH`. Preserve the active provider's database and encryption key. The public website may be served statically, but the admin interface must be opened through the backend at `/admin` (for example, `http://localhost:3001/admin`), never through Live Server.

## Local setup

1. Copy `.env.development.example` to `.env.development`. Use the Development project's URL, anon key, and server-only service-role key only. The local server defaults to `RAFA_ENV=development`, loads only `.env.development`, and rejects a hosted Supabase URL belonging to the other environment; it never falls back to `.env` or `.env.production`.
2. Set `FRONTEND_ORIGINS` to the exact local origins used by the public site, separated by commas.
3. Generate a unique development `RAFA_AUTH_ENCRYPTION_KEY` as a base64-encoded random 32-byte key:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
   ```

   Keep this key private. Do not reuse the production encryption key. The API uses it to encrypt authenticator secrets in the separate local auth-state database.
4. Run `npm install` and `npm start` from this folder. Startup validates that `SUPABASE_URL` matches the Development project (`jpitvhgyjsalswjuuwpm`), then the API listens on port `3001` by default and creates development-only application/auth SQLite files.
5. Start the public frontend using an origin configured in `FRONTEND_ORIGINS`. The public pages can read and submit data through the API. Open the backend `/admin` URL to sign in; the dashboard and its assets are withheld until password and MFA verification succeed. Website content edits load and save through the protected admin API; publishing requires an owner or manager session with MFA.

The admin API remains protected by its existing authentication and role checks. Owners and managers can approve or reject testimonial submissions from the Website Content review panel. Sensitive administrator, testimonial, and dessert-capacity changes additionally require a fresh password and MFA/recovery-code check, valid for five minutes. Login and step-up attempts are rate limited.

Owners can use the Settings screen at `/admin` to view the paginated administrator directory, invite accounts, and update display names, roles, or active state. It uses `GET /api/admin/auth/roles`, `GET /api/admin/auth/users?page=1&limit=25`, `POST /api/admin/auth/users`, and `PATCH /api/admin/auth/users/:id`. Invitations rely on Supabase Auth email configuration. The `20261119222000_admin_profile_management.sql` migration is applied to the linked hosted project, and live no-change profile updates return successfully through its audited RPC.

The API exposes `/health/live` for process liveness, `/health/ready` for database readiness, and `/health` as a compatibility alias for liveness.

## Development and production separation

The confirmed hosted projects are Development (`jpitvhgyjsalswjuuwpm`) and Production (`orybroticrcobzkxfpzv`). The same versioned migrations define the schema in both projects; the Development environment must use synthetic test records, not copied production customer records. Keep each project's Supabase URL and keys in its own protected environment configuration. Production deployments must set `RAFA_ENV=production`, `NODE_ENV=production`, and the Production project's `SUPABASE_URL` and server-only keys through the hosting provider's secret configuration. Startup checks that the hosted URL matches the selected environment.

The Supabase CLI's local `project_id` in `supabase/config.toml` names the local CLI project; it is not either hosted project. The current CLI link still points to Production, so remote migration commands must specify the intended project explicitly or link to Development first. The four pending CMS/Stage 4 migrations were applied only to Development (`jpitvhgyjsalswjuuwpm`); a read-only migration-history check confirmed all nine local migrations match. Never run `supabase db reset` against a hosted project.

## Supabase development scaffold

The project includes the Supabase CLI and versioned Postgres migrations. The foundation establishes Supabase Auth profiles, data-driven roles and permissions, audit-log/media/customer/settings tables, and restrictive RLS read policies. The website-data migration adds the original request, testimonial, site-content, and newsletter tables. The Stage 2 inquiry CRM is defined in `20261123143500_inquiry_engine.sql`; it imports existing contact/event leads, links repeat email addresses to one customer, and adds a protected Inbox data model. All five migrations are applied to the canonical Raffa project (`orybroticrcobzkxfpzv`). The Supabase CLI labels Raffa `production`; verify the target carefully and get explicit approval before future hosted database writes.

The Supabase website-data repository and Supabase Auth are connected to the public and protected admin API routes. Live testing verified email/password sign-in, app-managed MFA, protected admin content reads, public content reads, and a temporary contact submission that was removed after verification. Both providers now default to `supabase`; SQLite remains available as an explicit rollback option.

The linked project had no existing website content or submissions in SQLite, and its Supabase content table was empty before cutover, so no business records needed copying. The existing SQLite database remains preserved for rollback and continues to hold encrypted MFA secrets, recovery-code hashes, and Supabase session tokens.

The service-role read grant for `roles`, `admin_profiles`, and `role_permissions` is represented by `20261119194500_grant_service_role_admin_reads.sql`. It was applied during live setup; applying the migration again is safe.

Database startup now preserves the old `website_content_tokens` table and archives an incompatible legacy `admin_sessions` table rather than dropping either table. The SQLite copy remains available as a rollback source.

`ADMIN_AUTH_PROVIDER=supabase` opts admin sign-in into Supabase Auth email/password and requires an active `admin_profiles` entry. The current authenticator-app TOTP and one-time recovery-code flow remains app-managed; its secret, recovery-code hashes, encrypted Supabase access/refresh tokens, sessions, and step-up grants are stored in the separate `ADMIN_AUTH_DATABASE_PATH` file. On first startup, existing Supabase MFA/session state is copied from the business SQLite database before those auth-state tables are removed from it. Users must enroll TOTP again after switching providers. Owner-only API routes support administrator invitations, role changes, and deactivation; apply the profile-management migration before using these writes. Keep the auth database and `RAFA_AUTH_ENCRYPTION_KEY` persistent to preserve sessions and MFA state.

The project is intended to use the hosted Supabase project for development and no Docker setup is required for the normal remote workflow. Local Supabase CLI services are optional and can be checked from the project root only on a machine where the CLI and its container runtime are available:

```powershell
npm install
npm run supabase:start
npm run supabase:status
```

The foundation migration seeds five roles (`Admin`, `Manager`, `Inquiry staff`, `Catalogue staff`, and `Viewer`) and their permission assignments. Supabase Auth is the identity source; `admin_profiles` associates an Auth user with a role. The CLI configuration disables public signup locally, but hosted Auth settings must be configured separately. The migrations intentionally create no administrator account.

RLS currently allows authenticated users to read only data permitted by their profile and permission assignments; anonymous users can read only settings explicitly marked public. Writes are intentionally not granted to browser clients. Future Express routes must still enforce permissions server-side. If the API uses Supabase's service-role credential, it bypasses RLS, so route authorization remains mandatory; never expose that credential to the browser.

To re-apply migrations to an optional **local Supabase CLI database** (this resets that local database), run `npm run supabase:reset`. Stop optional local services with `npm run supabase:stop`. These commands do not migrate or modify `backend/data/` SQLite files or the hosted Supabase project.

Existing custom SQLite admin accounts use usernames, Argon2 hashes, and app-managed TOTP; they cannot be copied directly into Supabase Auth. Create or invite each Supabase user by email and enroll app-managed MFA. The existing SQLite database remains preserved. The foundation and website-data migrations were applied and the remote schema linted. The service-role grant migration is repeatable and records the grant applied during live setup. Optional local Supabase-stack validation is separate from the hosted Supabase workflow and does not require Docker for remote database migrations.

## Production setup

Deploy the API with HTTPS, configure the Supabase credentials, `RAFA_AUTH_ENCRYPTION_KEY`, and exact `FRONTEND_ORIGINS` in the hosting provider's secret/configuration store, and mount persistent storage for `DATABASE_PATH`. Restrict access to the `.env` file and database backups. Losing the encryption key prevents the API from decrypting existing authenticator secrets and tokens; keep a secure, recoverable backup. An ephemeral filesystem will lose local MFA/session state and recovery codes when the API restarts or redeploys; Supabase website data and Auth accounts remain in Supabase.

Set the `RAFA_API_BASE` build environment variable to the API's HTTPS origin when the API is hosted separately. The build injects it into the public pages; leave it unset when the API is served from the same origin. For a local PowerShell build:

```powershell
$env:RAFA_API_BASE = 'https://api.example.com'
npm run build
```

In Netlify, set `RAFA_API_BASE` in the site's build environment variables. This is a public API address, not a secret. Never put passwords, session cookies, or encryption keys in frontend code, URLs, source files, or public environment variables.

## Stage 2 inquiry development

The new public form sends `POST /public/inquiries` with a Cloudflare Turnstile token. Create site/secret keys for the local frontend origin and set `TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` in the backend environment. Missing or invalid CAPTCHA configuration rejects the submission; there is no bypass mode. The honeypot, rate limiter, strict Zod validation, JSON body limits, and image processing run before the transactional Supabase RPC stores a lead, customer link, timeline entry, attachments, and email-outbox record.

Inquiry topic and service choices are allowlisted server-side. Names accept Unicode letters/numbers and common name punctuation (up to 100 characters), email addresses are validated (up to 254), messages are required plain text (1 to 2,000 characters), and event/dessert/apparel “Other” descriptions are required and limited to 100 characters. The form shows counters for bounded text fields. Writes use typed Supabase RPC parameters; admin details render as text rather than HTML.

Optional reference images accept at most three JPEG, PNG, or WebP files (2 MB each, 5 MB total). The form applies the same checks to file selection, drag-and-drop, and pasted images; the API independently verifies actual image content and both source and processed totals before uploading to the private `inquiry-references` Storage bucket, which also enforces a 2 MB per-file limit.

Set `INQUIRY_NOTIFICATION_RECIPIENTS` to a comma-separated recipient list, `INQUIRY_EMAIL_FROM` to a verified sender, and `RESEND_API_KEY` to enable staff email notifications. Inquiries are committed before delivery; a persistent outbox retries failed sends with backoff. `INQUIRY_FOLLOW_UP_DAYS` configures the in-process reminder flag (default 3 days).

The admin Inbox uses the protected `/api/admin/inquiries` routes for filtering, pagination, status changes, assignments, timeline notes, private attachment links, and reply templates. Status transitions are checked in the database; Lost and Declined require a reason. The former public `/api/contact-inquiries` and `/api/celebration-requests` endpoints return `410 Gone` so they cannot bypass Turnstile.

The Stage 2 inquiry migration has been applied to the canonical Raffa project (`orybroticrcobzkxfpzv`). It imports legacy leads within that project; it does not transfer records from another Supabase project. The Supabase CLI labels Raffa `production`, so confirm the target before future hosted database writes.

## Stage 3 website CMS

The Stage 3 migration is `supabase/migrations/20261124100000_showcase_content_and_media.sql`. It adds homepage section settings, private content drafts, typed showcase entries (dessert/event packages, portfolio, FAQs), media-usage tracking, the private `showcase-media` bucket, and permission-checked/audited write RPCs. It was applied to the hosted Raffa project on 2026-11-25 and remotely schema-linted. A transactional hosted database smoke check verified content draft/publish privacy, homepage section settings, and showcase draft/publish/revision/archive behavior; temporary records and audit rows were rolled back, and the original section settings were verified unchanged. Signed-in CMS API/browser flows remain untested. Raffa is labeled `production`; get explicit approval before any further hosted database writes.

Once that migration is applied, the protected CMS routes support draft/publish and archive operations under `/api/admin/showcase`, page-text drafts at `/api/admin/site-content/:key`, section ordering/visibility at `/api/admin/site-sections`, and image upload/library metadata at `/api/admin/media`. Image uploads are decoded and re-encoded as WebP, capped at 5 MB source and 2 MB optimized, then stored privately. Public content returns only published, visible, unarchived showcase items; private draft payloads are not included. Public content responses use a 60-second cache lifetime. Run the backend test suite before deploying this code, and apply the migration before deploying backend code that reads the new tables.

## Stage 4 operations

The Stage 4 migrations are `20261124143000_stage_four_customer_quotes_bookings.sql`, `20261124160000_stage_four_booking_conflict_snapshot.sql`, and `20261125104000_grant_service_role_stage_four_reads.sql`. They define customer profiles, itemized KES quotes, bookings and append-only payments, calendar conflict checks, optional dessert capacity, operational summary data, and the server-side read grants required by the operations API. Conflict checks run as `VOLATILE` so a transaction that waits on the per-service/date advisory lock sees bookings committed before it acquired the lock.

Both migrations have been applied to the optional **local Supabase** stack and the hosted Raffa project. Local and hosted schema lint pass. A transactional production smoke check exercised quote totals and status transitions, inquiry-to-booking conversion, payment balance enforcement, event conflict detection and overrides, dessert capacity and overrides, and the operations summary. The test ran inside a rollback boundary; follow-up queries confirmed no smoke-test customers, inquiries, quotes, bookings, or audit rows remained and dessert capacity remained unlimited. The backend test suite covers route authorization, booking conflict/override responses, and permission-filtered summaries.

The production smoke checks called database functions directly; they did not test the signed-in Express/admin UI flow. A separate hosted concurrency check held the event/date advisory lock, committed a controlled booking while a second booking waited, and confirmed the second transaction detected the conflict. The temporary customer and booking were removed, with no audit rows left behind.

The signed-in UI check exposed missing `service_role` SELECT grants on tables read by the server-side operations repository. These database permission errors (`42501`) were translated to the generic 403 message. The read-grant migration has been applied to the hosted project; browser clients received no new table access. Signed-in requests for customers, quotes, bookings, calendar, operations summary, and dessert capacity now return HTTP 200. The lists are currently empty and dessert capacity remains unlimited; no production operation records were created or modified. The UI write flows (create/update, payments, and conflict overrides) remain untested. The project is production-labeled, so get explicit approval before further hosted database writes.

The general admin API limit is 60 requests per 15 minutes per client IP, HTTP method, and matched route, so normal traffic to one admin endpoint does not consume another endpoint's allowance. Login, MFA, step-up, and user-management requests retain their stricter dedicated limits.

## Managed data

- **Website content:** homepage floating cards, counters, services, portfolio, apparel catalog, and apparel newsletter copy. Page text supports private drafts and explicit publication. Structured packages, FAQs, section ordering/visibility, and private media require the Stage 3 migration described above.
- **Testimonials:** public submissions require consent and remain pending until an owner or manager approves them. Only approved submissions are returned as `home.testimonials` from the public content endpoint.
- **Inquiry Inbox:** `GET /api/admin/inquiries` supports search, type/status/date/assignee filters, sorting, pagination, and unread count. Inquiry details include activity, internal notes, status reason, and private attachments. Role permissions are checked in Express and again in write/list RPCs.
- **Legacy requests:** the old contact/event records are imported by the Stage 2 migration. Dessert order requests and newsletter subscriptions remain separate legacy request lists until their later stages.
- **Public submissions:** `POST /public/inquiries` is CAPTCHA-protected; existing apparel order requests, newsletter subscriptions, and testimonials retain their current endpoints. Legacy contact/event submission paths return 410.
- **Public content:** `GET /api/site-content`.
- **Testimonial review:** `GET /api/admin/testimonials` and `PATCH /api/admin/testimonials/:id` are protected by admin session, MFA, and role checks.

Dessert checkout saves an order request and customer-provided payment preference; it does not process a payment or confirm an order. Any submitted item prices and totals are unverified customer estimates, not authoritative prices; staff must verify them before quoting or fulfillment. Payment processing and bakery fulfillment integration are not included.
