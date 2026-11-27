# Runbook — Incident Response

## Roles
Incident lead (developer on call), communicator (business owner), scribe (optional). One person decides; others support.

## First 10 minutes
1. Acknowledge the alert; open an incident note (time, symptom, links).
2. Classify severity (doc 09). Check status of Cloudflare, Netlify, host, DB, providers.
3. Contain before diagnosing:
   - Suspected attack → raise Cloudflare security level / "Under Attack" mode, enable stricter rate rules, ban offending ASN/IP ranges.
   - Bad deploy → roll back (Netlify restore deploy; redeploy previous API image).
   - Data risk → switch API to **read-only mode** (feature flag).
   - Provider failing → confirm breaker open and outbox queueing; monitor.
4. Confirm the customer-facing fallback (phone/WhatsApp contact) is visible.

## Diagnose
- Use `requestId` from reports → logs. Check recent releases, config changes, traffic anomalies, event-loop lag, disk space, DB integrity, outbox depth.
- Capture evidence before restarting if safe (logs, heap snapshot, `PRAGMA integrity_check`).

## Security incident additions
- Preserve logs; do not wipe the host. Rotate admin token/sessions, DB/API/provider keys, webhook secrets (`secret-rotation.md`). Force logout all admins.
- Assess data exposed; if personal data is involved, follow the breach procedure: document, notify the Data Protection Commissioner and affected individuals within statutory timelines `[VERIFY: currently 72 hours for the regulator]`, inform the payment provider if relevant.

## Recovery
Restore service, verify with smoke tests (home, contact submit in staging, admin login, readiness), watch metrics for 30 min, then communicate resolution.

## Post-incident (within 5 days)
Blameless review: timeline, root cause, what detection/containment worked, action items with owners and dates; update runbooks, alerts, tests.

## Customer communication template
"We're aware of an issue affecting [feature]. [State truthfully whether submitted information is safe or still being checked]. We expect to resolve it by [time]. Contact us at [phone/WhatsApp]."
