# RAFA Events: Project Overview and Research Brief

**Purpose:** Give a researcher, designer, or developer a factual starting point
for studying how to complete and launch the RAFA website. This describes the
repository as it currently exists; it is not a claim that every shown price,
product, metric, testimonial, booking, or payment flow is live.

## 1. Project in brief

RAFA is a Kenya-oriented celebrations and lifestyle business website. Its
current public experience brings together:

- Event planning and coordination enquiries
- Apparel browsing and a local cart/checkout demonstration
- Celebration dessert enquiries
- General customer contact

The site is built as a static HTML/CSS/JavaScript frontend, with a separate
Node.js/Express API and SQLite database for website content and customer
submissions. A separate admin application contains both a sample analytics
dashboard and a protected Website Content area.

The storefront and admin have useful working demonstrations, but the project
is not yet a complete transactional commerce or event-booking system. In
particular, apparel stock, order placement, delivery pricing, payment
processing, payment verification, and automatic customer notifications are
not connected.

## 2. Public website and customer journeys

### Home: event planning

`frontend/index.html` is the event-marketing homepage. It presents RAFA's
services, process, portfolio examples, testimonials, package examples, FAQs,
and calls to enquire. Its interactive event planner estimates a rough budget
from browser-side selections such as event type, guest count, and style/vibe.
That estimate is a starting point for an enquiry, not a verified quote or a
booking.

The homepage also uses animated counters, image/video media, and responsive
navigation. Many portfolio examples, metrics, prices, and testimonial details
are demonstration content and need verification before being represented as
real business claims.

### Apparels: catalogue and product selection

`frontend/apparels.html` is a product-catalogue experience. Its browser
behavior is primarily in `frontend/assets/js/apparel.js` and styles are in
`frontend/assets/styles/apparels.css`.

Current interface behavior includes:

- Category filters and price sorting
- Product cards with image galleries, color selections, sizes, and quick view
- Wishlist and bag preview saved in browser `localStorage`
- Six product columns on wide desktop, four on tablet, and two on mobile
- Prices formatted in Kenyan shillings; sample prices and product data are not
  confirmed live inventory

The public catalogue can receive editable product content from the API, but
there is no stock reservation or inventory synchronization.

### Cart and simulated checkout

`frontend/cart.html` and `frontend/assets/js/apparelCart.js` implement the
apparel cart demonstration. Items are stored under the browser-local key
`rafa-apparel-bag-preview`. The current checkout UI has delivery, payment, and
review stages:

1. The customer enters delivery/contact details and selects a delivery type.
2. They select M-Pesa, card, or another payment preference.
3. Method-specific controls simulate a payment step.
4. A demo receipt is shown after the user explicitly simulates confirmation.

The simulation does **not** create an order, send an M-Pesa prompt, collect card
details, call a payment provider, or verify that money arrived. Delivery fees
are not configured, so displayed totals exclude delivery. The cart does not
call the existing dessert order-request API.

### Contact and dessert enquiries

`frontend/contact.html` and `frontend/assets/js/contact.js` provide a
progressive contact form. The customer can choose Events, Desserts, or
Apparels; the form then asks a topic-appropriate question, accepts an optional
message, and collects a name and email address. Successful submissions are
sent to `POST /api/contact-inquiries`.

Dessert choices on the contact form are enquiry categories, not an online
dessert catalogue or confirmed bakery order. The API also contains a separate
dessert order-request endpoint; the current apparel cart does not use it.

## 3. Admin application

The recovered `admin/index.html` is the official dashboard and opens directly
without a top-level sign-in page. Its Website Content section still uses a
legacy token flow, incompatible with the current session-authenticated admin
API. The production build excludes `admin/` pending Supabase integration and
redirects `/admin` to the public homepage.

- The dashboard in `admin/dashboard.js` and `admin/dashboard.css` uses demo
  data.
- The Website Content UI in `admin/website-content.js` and
  `admin/website-content.css` is not compatible with the current admin API
  authentication flow.
- Admin access uses individually provisioned username/password accounts,
  Argon2id password hashes, required TOTP MFA, one-time recovery codes, and
  role-based authorization (`owner`, `manager`, `support`, `viewer`). Successful
  MFA creates an HttpOnly, SameSite=Strict session cookie (12-hour absolute,
  30-minute idle expiry). Website Content uses the same authenticated session;
  no separate content access token is required. The API encryption key for
  authenticator secrets stays private and must not be put in frontend code,
  public environment variables, or committed files.
- The legacy admin API endpoints remain protected by the current authentication
  and role checks. Supabase integration is not yet implemented.
- The dark-mode dashboard palette uses Laser Lime (`#C6FF3D`) with a
  blue-black (`#0A0F14`) base; the light palette is separate.

The backend setup instructions and authentication requirements are documented in
`backend/README.md`. `backend/.env.example` is a template; a local `.env` must
be created and kept private.

## 4. Technical architecture

### Frontend

- Plain HTML, CSS, and browser JavaScript; no frontend framework or client-side
  build system is required.
- Shared page shell, header, footer, currency formatting, media handling, and
  responsive behavior are in `frontend/assets/js/` and
  `frontend/assets/styles/`.
- Public `<img>` elements default to native lazy loading with a shimmer
  placeholder; the home and apparel hero images remain eager. CSS background
  images are requested when their sections approach the viewport. The shimmer
  animation is disabled for reduced-motion preferences.
- Public content loading is handled by `frontend/assets/js/publicContent.js`.
  It requests `GET /api/site-content`, applies any returned editable content,
  and leaves the page's default content visible if the API is unavailable.
- The `rafa-api-base` meta tag controls the API origin. Local browser scripts
  default to `http://localhost:3001` when served from a localhost hostname.

### API and storage

- `backend/server.js` starts the Express application in `backend/src/app.js`.
- The API uses Helmet, CORS configuration, JSON body limits, and rate limits
  for public submissions and protected admin endpoints.
- `backend/src/validators/` contains input validation for contact and
  celebration requests. The server validates allowed values and field bounds;
  frontend validation alone is not trusted.
- `backend/src/db.js` creates and opens the SQLite database. Its tables cover
  site content, contact inquiries, celebration requests, dessert order
  requests, and newsletter subscriptions.
- `backend/data/` is runtime database storage. Production needs persistent
  storage and a backup/retention plan.

### Important API capabilities

| Endpoint | Current purpose |
| --- | --- |
| `GET /health` | Health check |
| `GET /api/site-content` | Public editable content |
| `POST /api/contact-inquiries` | Topic-based contact enquiry |
| `POST /api/celebration-requests` | Validated event-planning request |
| `POST /api/order-requests` | Dessert order-request record |
| `POST /api/newsletter-subscriptions` | Newsletter subscription |
| `/api/admin/site-content` | Protected content read/update |
| `/api/admin/{contact-inquiries,celebration-requests,order-requests,newsletter-subscriptions}` | Protected record lists and status updates |

These endpoints store enquiries or order requests. They do not establish event
availability, confirm an order, process payment, or send an automatic email.
The celebration-request API exists, but research and implementation should
confirm which current public form should submit to it.

### Build and deployment

- `npm run build` runs `scripts/prepare-netlify.js`.
- The script copies an explicit allowlist from `frontend/` into `dist/` and
  excludes the separate admin UI. It redirects `/admin` to the public
  homepage until Supabase authentication is implemented.
- `netlify.toml` publishes `dist/`; the build script also generates redirects
  for legacy pages.
- The frontend and API can be hosted separately. If so, set the public
  `RAFA_API_BASE` build variable to the API HTTPS origin, set exact allowed
  frontend origins, configure backend secrets in the hosting provider, and
  mount persistent database storage. The build injects the API origin into
  each public page; it is not a credential.

## 5. Data and trust boundaries

There are currently two different persistence models:

1. **Browser-only demonstrations:** apparel bag and wishlist live in each
   visitor's browser storage. Clearing browser data loses them; they are not
   visible to the admin or another device.
2. **Server-persisted records:** contact enquiries, celebration requests,
   dessert order requests, newsletter subscriptions, and managed website
   content are stored in SQLite.

The two models should not be confused. A demo receipt is not a payment
confirmation, a contact enquiry is not an event booking, and a dessert
order-request record is not a processed sale. Future production work should
make these state boundaries explicit in both UI and API.

## 6. Main open questions for research

Resolve business rules before committing to a production architecture:

- **Business scope:** Which services launch first: events, desserts, apparel,
  or all three? Which are enquiries versus direct purchases?
- **Markets and currency:** Is Kenya the only launch market? Which currencies,
  languages, service areas, and tax rules apply?
- **Event operations:** What information is needed to qualify an enquiry?
  Who checks availability, quotes, contracts, deposits, schedule changes, and
  cancellation/refund requests?
- **Products and stock:** Who owns product data, variants, sizes, colors,
  images, prices, stock counts, and updates? What happens when stock changes
  after a customer adds an item to a cart?
- **Desserts:** Which products, customization limits, lead times, pickup or
  delivery areas, capacity constraints, and final prices are real?
- **Delivery:** Which regions are served, how are delivery fees calculated,
  and when is a delivery estimate considered confirmed?
- **Payments:** Which payment methods and providers are supported in the launch
  market? Research official M-Pesa provider documentation and locally
  available card/payment aggregators. Compare KES support, transaction fees,
  settlement times, refunds, reconciliation, sandbox tools, uptime, support,
  and business onboarding requirements. Use provider-hosted/tokenized card
  collection; do not build storage for raw card numbers or security codes.
- **Payment lifecycle:** How do signed provider callbacks/webhooks, retries,
  duplicate notifications, pending/failed/cancelled states, idempotency, and
  reconciliation work? A browser redirect or user click must not be trusted as
  proof of payment.
- **Order lifecycle:** What are the authoritative order states, and who can
  change them? How will inventory be reserved/released, and how are partial
  fulfillment, refunds, and cancellations represented?
- **Notifications and support:** Which transactional emails, SMS/WhatsApp
  updates, receipts, and staff alerts are needed? Which system is responsible
  for sending and recording them?
- **Policies and customer data:** What privacy notice, terms, returns,
  delivery, cookie, retention, access-control, and data-export/deletion
  requirements apply?

## 7. Recommended research tracks

Use the current repository as a baseline and research decisions rather than
assuming a new framework or provider is needed.

1. **Commerce and checkout:** map cart, inventory, order, payment, fulfillment,
   refund, and notification state machines. Compare a hosted-commerce platform
   against extending this custom frontend/API.
2. **Kenyan payments:** read official Safaricom Daraja and shortlisted
   aggregator documentation; prototype only in provider sandboxes. Confirm
   current product availability and business eligibility directly with each
   provider.
3. **Event lead management:** research enquiry qualification, availability
   calendars, quote/contract approvals, deposits, milestone billing, and staff
   handoff workflows.
4. **Dessert operations:** model made-to-order lead times, customization,
   capacity, pickup/delivery slots, and seasonal availability.
5. **Product catalog and fulfillment:** investigate variant/inventory
   modeling, stock reservation, image workflows, shipping rules, and
   reconciliation with the admin content editor.
6. **Security and privacy:** review OWASP guidance for validation,
   authentication, authorization, CSRF/CORS, rate limits, secure sessions,
   secrets, logging, backups, and incident response. Review local privacy and
   consumer-protection requirements with qualified sources.
7. **Accessibility, performance, and discovery:** assess WCAG 2.2, keyboard
   operation, screen-reader status announcements, responsive layouts, Core Web
   Vitals, image/video optimization, metadata, structured data, and search
   indexing. Do not publish structured product or business facts until they
   are verified.
8. **Operations and deployment:** compare static hosting/API hosting options,
   persistent SQLite hosting versus a managed database, automated backups,
   staging and production environments, monitoring, restore procedures, and
   cost.

Useful primary references to locate during research include the official
Safaricom Daraja portal, official payment-provider API documentation, PCI
Security Standards Council material, OWASP Cheat Sheets, WCAG 2.2, web.dev
Core Web Vitals, and Google Search Central documentation. Verify current
versions and local applicability rather than relying on secondary summaries.

## 8. Suggested research output

For each researched topic, record:

- The actual user/business problem and relevant user journey
- Options considered and comparison criteria
- Facts that must be confirmed by RAFA or a provider
- Data model and state transitions
- Security, privacy, accessibility, and failure cases
- One recommended approach with trade-offs and operating cost
- A staged implementation plan and measurable acceptance criteria

Keep assumptions labeled. In particular, do not treat sample products, prices,
metrics, testimonials, availability, delivery charges, or demo payment status
as verified business data.

## 9. Repository map

- `frontend/` — public page sources and browser assets
- `frontend/assets/js/` — shared shell, content loading, apparel, cart, contact,
  media, currency, and mobile interactions
- `frontend/assets/styles/` — shared and page-specific styling
- `admin/` — dashboard demo and protected Website Content UI
- `backend/` — Express API, validation, SQLite setup, and API tests
- `database/` — migration and seed directories
- `scripts/prepare-netlify.js` — static deployment assembly
- `docs/` — architecture, page map, implementation notes, and this brief
- `tests/` — unit, integration, and security test areas

Some older notes in `docs/` describe earlier designs and may not match the
current four-page site. Use the current source, `docs/architecture.md`, and
`docs/file-map.md` as the implementation baseline; label older decisions as
historical until checked against the code.
