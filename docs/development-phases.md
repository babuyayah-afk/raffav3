# RAFA Events — Phased Development Plan

This plan applies the full-stack development toolkit to the repository as it
exists today. It is a delivery sequence and a set of decision gates, not a
commitment to replace the current stack or to launch every business line at
once. Phase durations and costs should be estimated after scope and provider
choices are confirmed.

## Guiding decisions

- Preserve the working static HTML/CSS/JavaScript site, Express API, SQLite
  database, and protected admin while they meet requirements. Avoid a rewrite
  as a prerequisite for customer-facing improvements.
- Use the toolkit's security, testing, deployment, and recovery practices
  incrementally. Verify existing controls before rebuilding them.
- Treat direct apparel/dessert sales and event bookings as separate business
  workflows. A submitted enquiry, demo receipt, or payment preference is not a
  confirmed booking, order, or payment.
- Decide launch services, market, delivery rules, inventory ownership, payment
  provider, privacy obligations, and operating capacity before designing
  irreversible commerce behavior.
- Prefer managed services when they materially reduce operational risk and fit
  the budget. Record expected recurring costs, quotas, backup terms, and an
  export/migration path before selecting one.
- Introduce TypeScript, React/Vite, PostgreSQL, Docker, or other new
  infrastructure only through a documented decision and a small validated
  step. The toolkit recommends them as a reference stack, not as a reason to
  replace working production code immediately. Do not introduce Redis,
  Kubernetes, or microservices without measured need.

## Current baseline

The project already has a four-page public site, a separate admin application,
an Express API, SQLite persistence, public submission validation and rate
limits, protected admin accounts with MFA and role-based permissions, a
Netlify static build, and unit/integration/security tests.

The apparel cart remains a browser-local demonstration. Payments, stock,
delivery fees, transactional notifications, and confirmed commerce orders
are not connected. Event and dessert submissions are requests, not confirmed
bookings or fulfilled orders. Sample business claims and catalog data still
need owner verification.

Before each phase, check the source and tests; do not treat a checklist item as
missing solely because it appears in an older roadmap.

## Phase 0 — Confirm scope and business rules

**Goal:** Agree what RAFA is building and what is in the first production
release.

**Work**

- Select launch services: events, desserts, apparel, or a staged subset.
- Confirm target market, currency, service/delivery regions, support hours,
  customer contact channels, and who owns content and product data.
- Define whether each journey is an enquiry, quote, booking, or direct
  purchase; agree who approves availability, prices, cancellations, and
  refunds.
- Confirm real product variants, stock process, dessert lead times/capacity,
  delivery charges, event deposits, and required customer notifications.
- Review privacy, retention, consent, consumer, and accessibility requirements
  with appropriate business/legal stakeholders.
- Record decisions, assumptions, open questions, and a prioritized launch
  backlog. Mark unverified prices, testimonials, metrics, and products.

**Exit gate**

- A named business owner approves the launch scope and workflow for each
  included service.
- Prices, availability, fulfillment responsibilities, and any legal/policy
  requirements have an owner and a verification status.
- No payment or booking implementation begins while its business rules remain
  unresolved.

## Phase 1 — Establish the delivery foundation

**Goal:** Make changes repeatable, reviewable, and testable without changing
the user-facing architecture unnecessarily.

**Work**

- Establish source control and a shared repository workflow; use reviewed
  changes and protected default-branch rules where the hosting plan supports
  them.
- Document supported Node.js versions, local setup, environment variables,
  test commands, build/deploy steps, and the division between frontend and API.
- Add a CI pipeline that runs the existing Node test suites and Netlify build.
  Add dependency and secret scanning; make failures visible rather than
  silently skipping checks.
- Add formatting/lint/type-checking only with a scoped adoption plan. Keep the
  current `node:test` suite unless a framework change brings a concrete
  benefit.
- Add focused tests for critical public submissions, admin authorization,
  content editing, and build output as gaps are found.
- Decide whether to pilot TypeScript on new or isolated backend modules. Adopt
  React/Vite or a component library only if a validated UI requirement
  justifies migration cost; retain static pages where they remain effective.

**Exit gate**

- A clean checkout can install dependencies, run tests, and produce the
  deployment artifact using documented commands.
- Automated checks run for reviewed changes and expose failures.
- Any language/framework migration has a small pilot, acceptance criteria, and
  a rollback path before broader adoption.

## Phase 2 — Production security, reliability, and operations

**Goal:** Prove the existing protections work in a production-like environment
and close operational gaps before adding sensitive workflows.

**Work**

- Review current authentication, MFA enrollment/recovery, session expiry,
  role permissions, CSRF/origin protections, public rate limits, validation,
  security headers, and secret handling against the toolkit and OWASP
  guidance. Fix verified gaps; do not replace controls that already meet the
  requirement.
- Configure HTTPS, exact production origins, secure hosting secrets, dependency
  updates, and appropriate admin/API origin deployment.
- Configure persistent database storage, automated backups, access controls,
  retention, and a documented restore procedure. Exercise a restore before
  launch.
- Add structured operational logs with request correlation and PII/secret
  redaction, plus frontend/API error reporting, uptime checks, and actionable
  alerts.
- Set up a staging environment and rehearse deployment, rollback, database
  recovery, and failure handling.
- Add database migrations and a versioned schema-change procedure before
  production data changes become difficult to reverse.

**Exit gate**

- Staging passes authentication/authorization and security checks, and secrets
  are not present in the client bundle or repository.
- A backup has been restored successfully and the recovery steps are
  documented.
- The team can identify service failure, deploy a known version, and roll it
  back without losing persistent data.

## Phase 3 — Complete and verify the launch customer journeys

**Goal:** Deliver truthful, accessible, and supportable versions of the
selected launch journeys.

**Work**

- Review every public page and admin workflow on mobile and desktop; verify
  keyboard operation, labels, error/status announcements, contrast, reduced
  motion, and WCAG 2.2 AA priorities.
- Replace or clearly label sample catalog content, prices, testimonials,
  portfolio claims, and analytics. Add verified policies and contact/support
  details.
- Connect the public event journey to the existing celebration-request API
  where required. Confirm the submitted data, validation, customer
  confirmation, and staff follow-up process end to end.
- Review the content editor and inquiry records for least-privilege access,
  useful search/status workflows, safe handling of customer data, and
  validation/preview needs.
- Add reliable customer acknowledgements and staff notifications only after
  selecting delivery channels and defining retry/failure handling.
- Improve performance and search metadata for verified content; set measurable
  accessibility, performance, and browser-support acceptance targets.

**Exit gate**

- Each in-scope journey works from public form to persisted admin record and
  staff action, including invalid input and service-failure cases.
- Customer-facing content is owner-verified and no demo is presented as a
  completed transaction.
- Accessibility and performance checks meet the agreed release targets.

## Phase 4 — Build a real commerce foundation

**Goal:** Introduce authoritative products, inventory, pricing, and order
records before integrating payment.

**Work**

- Confirm product/variant identifiers, price ownership, inventory changes,
  delivery zones/fees, order statuses, cancellation/refund rules, and staff
  responsibilities.
- Design server-authoritative pricing and order creation, including
  idempotency, stock reservation/release, audit history, and failure states.
- Reassess storage against transactional and operational needs. PostgreSQL is
  the toolkit's recommended default for commerce; choose a managed PostgreSQL
  service only after comparing cost, backups, access, recovery, region, and
  migration/export options. If SQLite is retained for an initial scope, prove
  persistent storage, safe migrations, backup/restore, and concurrency limits.
- Implement schema migrations and repository/data-access boundaries. If
  adopting TypeScript and Drizzle, do so as a bounded migration with typed
  schemas and tests, not as a simultaneous rewrite of every page and API.
- Replace local-only cart assumptions with server-validated cart/order
  operations for the launch scope. Clearly separate draft, submitted, and
  confirmed order states.

**Exit gate**

- The server calculates totals and validates inventory; client values are not
  trusted.
- Duplicate submissions do not create duplicate orders, and stock cannot be
  oversold under the expected launch load.
- Schema changes, backup, restore, and order-state transitions are tested in
  staging. No live payment is accepted yet.

## Phase 5 — Integrate payments and fulfillment

**Goal:** Accept and reconcile real payments safely for the approved commerce
scope.

**Work**

- Compare eligible payment providers using official documentation and
  sandbox access, including fees, settlement, refunds, webhook support,
  reconciliation, local onboarding, support, and service limits.
- Use provider-hosted or tokenized card collection; never store raw card
  numbers or security codes.
- Implement provider sandbox initiation, signed callback/webhook validation,
  idempotent event processing, pending/failed/cancelled/succeeded states,
  reconciliation, refunds, audit records, and safe retry behavior.
- Send receipts and fulfillment notifications through an outbox/worker or an
  equivalently reliable provider integration. Track delivery failures for
  staff follow-up.
- Remove or clearly replace simulated payment controls and demo receipts only
  after real end-to-end flows pass.

**Exit gate**

- Sandbox tests cover success, decline, timeout, duplicate/out-of-order
  callbacks, webhook forgery rejection, and refund/reconciliation behavior.
- An authorized end-to-end test creates one order and one payment record,
  without relying on a browser redirect or user click as proof of payment.
- Staff have documented procedures for payment discrepancies, cancellation,
  refunds, and fulfillment failures.

## Phase 6 — Extend event and dessert operations

**Goal:** Add the distinct service workflows selected for launch or later
release without misusing the commerce order model.

**Work**

- For events, define qualification, availability checks, quote/approval,
  contract/deposit, schedule changes, cancellation, and customer/staff
  communications.
- For desserts, define made-to-order catalog/customization, lead time,
  capacity, pickup/delivery slots, availability cutoffs, and fulfillment.
- Reuse appropriate customer, notification, payment, and audit capabilities,
  while preserving service-specific states and permissions.
- Add operational dashboards, assignment/SLA handling, and reporting only
  where staff workflows require them.

**Exit gate**

- Each selected service has an owner-approved state model and successful,
  rejected, changed, and cancelled journey tests.
- Availability and payment/booking status are controlled by the server and
  staff workflow, not inferred from a form submission.

## Phase 7 — Launch and improve against evidence

**Goal:** Release safely, then invest in scaling based on real usage and
measured operational limits.

**Work**

- Complete release review for security, accessibility, privacy/policies,
  content accuracy, backups, monitoring, alerts, support ownership, rollback,
  and staff readiness.
- Use staged rollout where practical; monitor errors, performance, abandoned
  journeys, support issues, conversion, and payment reconciliation.
- Review actual service demand and cost, hosting/database quotas, backup
  freshness, and operational workload on a regular schedule.
- Add queues, Redis, additional application instances, database replicas,
  advanced analytics, or orchestration only when measurements identify a
  specific bottleneck or reliability need.

**Exit gate**

- Production checks, restore/rollback, alert routing, support contacts, and
  launch responsibilities are verified.
- The team reviews operational and product metrics and turns findings into a
  prioritized next-release backlog.

## Release checklist

- [ ] Launch scope and business rules have an accountable owner.
- [ ] Production content, prices, service areas, and policies are verified.
- [ ] Critical public, admin, and API journeys pass automated and manual tests.
- [ ] Authorization, secrets, HTTPS, validation, abuse controls, and dependency
      alerts are checked.
- [ ] Persistent data has an automated backup and a verified restore path.
- [ ] Monitoring, error reporting, and alerts reach a responsible person.
- [ ] Rollback and customer-support procedures have been rehearsed.
- [ ] Demo payment/booking behavior is removed or unmistakably labeled.
- [ ] Accessibility and performance meet agreed launch targets.
- [ ] Any real payment provider has passed sandbox, webhook, and reconciliation
      tests before production credentials are enabled.

## Toolkit-to-project mapping

| Toolkit recommendation | Application to RAFA |
| --- | --- |
| Node.js + TypeScript | Keep Node/Express as the current baseline; evaluate incremental TypeScript adoption for new or isolated modules. |
| React + Vite, Tailwind, shadcn/ui | Optional UI evolution. Preserve the static site/admin until a concrete maintenance, accessibility, or product need justifies migration. |
| PostgreSQL + Drizzle | Preferred option to evaluate for transactional commerce; decide after scope, hosting, migration, and recovery requirements are known. |
| Better Auth or equivalent | Do not replace the existing MFA/session/RBAC implementation without a requirements and security comparison. |
| Docker + Compose | Consider for reproducible local API/service setup if it reduces setup drift; not a launch blocker for the current static deployment. |
| Vitest + Playwright | Keep current tests; consider browser E2E coverage for critical public/admin journeys and adopt tools where they fill demonstrated gaps. |
| GitHub Actions, dependency/secret scanning | Add to the delivery foundation once the repository hosting workflow is established. |
| Managed hosting, secrets, monitoring | Choose based on recovery, access controls, region, quotas, support, and total cost—not headline price alone. |
| Redis, Kubernetes, microservices | Defer until measured workload or operational boundaries justify the added cost and complexity. |
