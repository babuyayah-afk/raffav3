# Architecture

# Architecture

The repository is organized by application responsibility:

- `frontend/` is the source of truth for the public website pages and their
  browser assets.
- `backend/` contains the Node/Express API and its SQLite data layer.
- `frontend/index.html` is the integrated public home and event destination.
- The public site has four pages: Home, Apparels, Cart, and Contact.
- `frontend/cart.html` provides a browser-local apparel checkout demo with
  simulated payment steps and a demo receipt. It does not submit orders, send
  payment prompts, collect card details, or take payment.
- `POST /api/celebration-requests` stores a rate-limited event enquiry in SQLite.
  It does not create a booking or confirm availability, pricing, or payment.
- `admin/` is a separate administrative application.
- `database/` holds schema migrations and seed data.
- `scripts/` contains build and maintenance commands.
- `docs/` describes the system and its source layout.
- `tests/` is organized into unit, integration, and security suites.

Netlify builds the deployable public site from its allowlist in `frontend/`
into the generated `dist/` directory. Legacy Events and Desserts URLs redirect
to homepage anchors. The `admin/` application is copied separately into the
deployment and is not part of the public frontend source.

The apparel bag is a browser-local preview; stock validation, order submission,
and payment are not connected. Configure the `rafa-api-base` meta value in
`frontend/index.html` to the deployed API origin when it is hosted separately;
local development on `localhost` defaults to port 3001.
