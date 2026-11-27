# File Map

## Public website

- `frontend/` contains the four public page entry points: Home, Apparels, Cart,
  and Contact.
- `frontend/assets/js/` contains browser behavior and shared site modules.
- `frontend/assets/styles/` contains page-specific and shared stylesheets.
- `frontend/index.html` integrates event discovery and the enquiry builder.
  `frontend/cart.html` displays the local apparel bag preview; checkout is not
  connected.

## Backend

- `backend/server.js` starts the API.
- `backend/src/` contains the Express app, routes, middleware, validators, and
  database connection.
- `backend/src/validators/celebrationRequestValidator.js` validates public
  celebration enquiry submissions before they are stored.
- `backend/data/` is runtime database storage; generated database files do not
  belong in source control.

## Admin

`admin/` is a separate administrative application and is maintained
independently from the public website.

## Build and supporting resources

- `scripts/prepare-netlify.js` builds `frontend/` into the ignored `dist/`
  deployment directory and includes the separate admin app.
- `database/` contains migrations and seeds.
- `docs/` contains project documentation.
- `docs/development-phases.md` defines the gated delivery plan from business
  scope through production launch and measured scaling.
- `tests/` contains unit, integration, and security test suites.
