# Celebrations redesign: research and implementation decisions

> Historical note: this records an earlier implementation phase. The current
> public site has four pages, and its Cart page now displays the browser-local
> apparel bag preview. Order submission and payment are not connected.

## Repository findings

- `frontend/index.html` already combines apparel, event, and dessert previews, but
  directs Events and Desserts to separate pages.
- `dessertMockData.js` explicitly supplies sample products, prices, delivery
  amounts, coupons, and tracking steps. `media.js` uses remote Unsplash imagery
  for those previews. None of these are verified live inventory or RAFA product
  photography.
- The dessert cart and checkout are browser-local demos. The backend has a
  rate-limited SQLite order-request endpoint, but the public checkout does not
  call it. There is no payment processor, event-enquiry endpoint, or customer
  account flow.
- Netlify publishes an explicit file allowlist. `apparels.html` and the separate
  `admin/` application are out of scope and must remain unchanged.

## Research applied

- [WCAG 2.2](https://www.w3.org/TR/WCAG22/): retain semantic controls, visible
  keyboard focus, readable labels/statuses, and reduced-motion behavior.
- [Baymard checkout-flow research](https://baymard.com/blog/checkout-flow-average-form-fields):
  preserve the existing checkout presentation and avoid adding unrelated
  required fields.
- [web.dev Core Web Vitals](https://web.dev/articles/vitals): treat LCP, INP,
  and CLS as measurable objectives, reserve image space, and defer
  below-the-fold media.
- [OWASP Input Validation Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Input_Validation_Cheat_Sheet.html):
  validate event requests on the server with allowlisted values and bounded
  lengths; do not trust browser-submitted prices.
- [MDN forms](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/form):
  use native form semantics and browser constraint validation.
- [Google Search Central product structured data](https://developers.google.com/search/docs/appearance/structured-data/product):
  do not publish product markup for mock prices, availability, or offerings.

## Decisions

1. Make the homepage the public Events + Desserts destination and use occasion
   cards to move directly into the relevant cake and celebration-builder
   choices. Keep Apparel as its existing independent destination.
2. Keep the current dessert/cart experience visibly identified as a demo until
   verified catalogue, pricing, delivery, and payment details are supplied.
   Preserve the existing cart storage key and checkout behavior while moving
   its UI from a dialog into a standalone cart page.
3. Offer the event builder as a request for discussion, not a package purchase.
   Existing event-form choices are expressed as customer interests; scope,
   availability, and pricing remain subject to RAFA confirmation.
4. Persist builder submissions through a narrowly scoped, rate-limited
   create-only backend endpoint. Do not expose request records, add uploads,
   or represent an enquiry as a confirmed booking.
5. Do not delete source pages or assets as part of the broad cleanup request.
   Remove obsolete Events/Desserts destinations from shared navigation and use
   redirects to the integrated homepage sections so old links keep working.
6. Do not add product or business structured data until production facts are
   verified. Keep admin and apparel source untouched.
