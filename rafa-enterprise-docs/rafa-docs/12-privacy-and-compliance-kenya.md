# 12 — Privacy and Compliance (Kenya-oriented)

> This is an engineering checklist, **not legal advice**. Have a qualified Kenyan lawyer review final policies and obligations. Items marked `[VERIFY]` need confirmation.

## 1. Primary framework

- **Kenya Data Protection Act, 2019** and its regulations (administered by the Office of the Data Protection Commissioner, ODPC). Typical obligations: lawful basis (often consent or contract), purpose limitation, data minimization, accuracy, storage limitation, security safeguards, data-subject rights (access, correction, deletion, objection), breach notification to ODPC and affected individuals within statutory timelines `[VERIFY: 72 hours]`, and **registration as data controller/processor** if applicable `[VERIFY current thresholds and fees]`.
- Cross-border transfers (providers outside Kenya) have conditions `[VERIFY]`; list processors and locations in the privacy notice.
- If serving EU/UK visitors: GDPR/UK GDPR may apply `[VERIFY]`.
- Consumer protection: Kenya Consumer Protection Act and e-commerce rules; clear pricing, returns, delivery information `[VERIFY]`.
- Payments/tax: KRA obligations and eTIMS for sales `[VERIFY with accountant]`; M-Pesa/provider terms.
- Marketing messages: explicit opt-in, easy opt-out for email/SMS; Communications Authority rules for SMS `[VERIFY]`.

## 2. Data inventory (maintain as `docs/data-map.md`)

| Data | Source | Purpose | Lawful basis | Stored where | Retention | Shared with |
|---|---|---|---|---|---|---|
| Name, email, message, topic | contact form | respond to enquiry | consent / pre-contract steps | DB | 12–24 mo | email provider |
| Event details, budget, date | celebration request | quote/planning | pre-contract | DB | 24 mo | staff |
| Newsletter email | signup | marketing | consent (double opt-in) | DB + email service | until unsubscribe | email service |
| Order, address, phone | checkout (future) | fulfilment | contract | DB | statutory | courier, PSP |
| Payment reference | PSP | accounting | legal obligation | DB | statutory | PSP |
| Admin identity, audit | admin | security | legitimate interest | DB | 24 mo | none |
| IP, user-agent | logs | security/abuse | legitimate interest | logs | 30–90 days | log vendor |

## 3. Required public documents

Privacy notice, Terms of service, Returns & refunds, Delivery policy, Cookie notice (if non-essential cookies), Newsletter terms. Link in footer and at each form/checkout step. Consent text next to forms in plain language ("We'll use your details to reply to your enquiry. See our Privacy Notice.").

## 4. Rights handling

- Procedure + admin tooling to: find all records by email, export (JSON/CSV), correct, delete/anonymize, and record the request and completion date (respond within statutory time `[VERIFY: 30 days]`).
- Deletion exceptions (legal retention) documented.
- Unsubscribe link in every marketing email; suppression list retained as a hash.

## 5. Technical measures mapped to obligations

| Obligation | Control |
|---|---|
| Security safeguards | docs 02–03, encryption, access control, audit log |
| Minimization | short forms; no card data; truncated IP in logs |
| Storage limitation | retention jobs (doc 05) |
| Accountability | data map, DPIA for payments/CCTV-like features, processor agreements (DPAs) with vendors |
| Breach response | `runbooks/incident-response.md` including notification templates |
| Consent proof | store consent timestamp, text version, IP hash for newsletter |

## 6. Vendor management

Sign/accept DPAs with email, SMS, hosting, analytics, error-tracking, and payment vendors; record locations; review annually; prefer vendors with SOC 2/ISO 27001.

## 7. Children and sensitive data

Do not target minors; don't collect sensitive categories (health, religion, etc.) beyond what an event brief inherently needs; if event notes contain such data, restrict access and shorten retention.

## 8. Accessibility and fairness

Publish an accessibility statement; provide alternative contact channels (phone, WhatsApp, email) for people unable to use forms.
