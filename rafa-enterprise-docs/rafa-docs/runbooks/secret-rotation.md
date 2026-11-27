# Runbook — Secret Rotation

| Secret | Rotate | How |
|---|---|---|
| Admin account password | On suspected compromise or staff departure | Owner resets MFA/disables departing accounts in Authentication. Password-change/reset workflow is not yet implemented; provision a replacement account if needed. |
| `RAFA_AUTH_ENCRYPTION_KEY` | On suspected compromise, only with a coordinated migration | Back up the DB and old key; use a reviewed migration to decrypt and re-encrypt all TOTP secrets, validate logins, then deploy the new key. The application does not currently rotate this key automatically. |
| Email/SMS API keys | 180 days / incident | Create new key, deploy, verify, delete old |
| Turnstile secret | yearly / incident | Rotate in Cloudflare, update env |
| Webhook secrets / callback path secret | 180 days / incident | Register new URL/secret with provider, accept both during overlap, retire old |
| DB credentials (Postgres) | 180 days | New role password, update, restart, revoke old |
| Backup encryption key | yearly | Encrypt new backups with new key; keep old key to read old backups |

After any rotation: confirm health, test a form submission and admin login, update the secret inventory (owner, date, next due).
Emergency (suspected leak): rotate immediately, invalidate sessions, review logs for the exposure window, follow the incident runbook.
