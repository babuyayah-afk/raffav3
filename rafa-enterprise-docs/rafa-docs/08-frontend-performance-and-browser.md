# 08 — Frontend Performance, Browser Compatibility and Accessibility

Frontend stays plain HTML/CSS/JS (no framework required). Focus: ship less, ship it cached, degrade safely.

## 1. Targets (Core Web Vitals, 75th percentile on mobile, 4G)

| Metric | Target |
|---|---|
| LCP | ≤ 2.5 s (aim 1.8 s) |
| INP | ≤ 200 ms |
| CLS | ≤ 0.1 |
| TTFB | ≤ 600 ms (static from CDN ~100 ms) |
| Total transfer, first view | ≤ 500 KB (excluding lazy media) |
| JS per page | ≤ 100 KB gzip |
| Lighthouse (mobile) | Performance ≥ 90, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95 |

Many Kenyan users are on mobile data with variable latency: optimize for small payloads and resilience first.

## 2. Build and delivery

- Keep the allowlist build (`scripts/prepare-netlify.js`) and extend it: minify HTML/CSS/JS (esbuild/lightningcss), content-hash asset filenames, emit a manifest, write `_headers`.
- ES modules with `type="module"`; `defer` for classic scripts; split per page (`apparel.js`, `cart.js`, `contact.js` loaded only where needed).
- Inline critical CSS (~10 KB) for above-the-fold; load the rest with `media="print" onload` pattern or `rel=preload`.
- Fonts: self-host WOFF2, subset to Latin, `font-display: swap`, preload at most 2 files; prefer system font stack for body.
- Resource hints: `preconnect` to API origin and media CDN; `preload` the LCP image; `dns-prefetch` for others.
- Avoid layout-shifting widgets: reserve space (`aspect-ratio`, `width`/`height` attributes).

## 3. Images and video (largest weight on this site)

- Formats: AVIF → WebP → JPEG fallback via `<picture>`; responsive `srcset` + `sizes`.
- `loading="lazy"` and `decoding="async"` for everything below the fold; LCP image gets `fetchpriority="high"`, never lazy.
- Product grids (6/4/2 columns): request width-appropriate sizes (e.g. 240/360/480 px); placeholder blur or dominant colour.
- Video: `poster`, `preload="none"`, `playsinline muted` for background loops, pause when off-screen (`IntersectionObserver`), honor `prefers-reduced-motion` and `Save-Data`.
- Budget: hero image ≤ 150 KB, product images ≤ 60 KB.

## 4. Caching

| Asset | Cache-Control |
|---|---|
| Hashed JS/CSS/fonts/images | `public, max-age=31536000, immutable` |
| HTML | `public, max-age=0, must-revalidate` (Netlify edge validates; instant deploys) |
| `/api/v1/site-content` | `public, max-age=60, stale-while-revalidate=300` + ETag |
| Admin | `no-store` |

Client cache for content: store last good `site-content` in `localStorage` with timestamp; render it instantly, refresh in background (stale-while-revalidate pattern), never block rendering on the API.

## 5. Optional service worker (progressive enhancement)

- Cache static shell + last content; network-first for API; cache-first for hashed assets; offline fallback page.
- Version the cache, delete old caches on activate, never cache POSTs or admin routes.
- Keep it small; test update flow so users never get stuck on stale builds (`skipWaiting` + prompt to refresh).

## 6. JavaScript quality and safety

- No inline event handlers (CSP). Use event delegation for product grids.
- DOM: `textContent`, `createElement`; sanitize any HTML from the API (DOMPurify) before insertion.
- `localStorage` access wrapped in try/catch (private mode/quota); namespaced keys with schema version (`rafa-apparel-bag-preview:v1`); validate parsed data (shape, quantity ranges) before use — treat it as untrusted input.
- Debounce filters/search; use `requestAnimationFrame` for animations; counters pause off-screen and respect reduced motion.
- Passive listeners for scroll/touch; avoid layout thrash; keep long tasks < 50 ms (break up work with `scheduler.yield`/`setTimeout`).
- Central `api.js` with timeout, error mapping to the contract in doc 04, no secrets, `credentials: 'omit'` for public calls.
- Feature detection, not user-agent sniffing; avoid unshipped APIs without fallbacks.

## 7. Browser support policy

Evergreen browsers (last 2 versions Chrome, Edge, Firefox, Safari incl. iOS Safari, Samsung Internet) plus Chrome for Android on low-end devices. Verify with `browserslist` and MDN/Can I Use before using newer CSS (container queries, `:has`, `dvh`) and provide fallbacks. Test on a real low-end Android phone and throttled network.

## 8. Accessibility (WCAG 2.2 AA)

- Semantic landmarks (`header/nav/main/footer`), one `h1` per page, logical heading order.
- Keyboard: all interactive elements reachable, visible focus (≥ 3:1 contrast), no traps in menus/quick view/modals; `Esc` closes dialogs and returns focus.
- Forms: associated `<label>`, `aria-describedby` for errors, `aria-live="polite"` status region for submit results and cart updates (the brief calls for screen-reader status announcements), `autocomplete` tokens (`name`, `email`, `tel`).
- Dialogs: use `<dialog>` or focus-trap with `aria-modal`.
- Colour contrast ≥ 4.5:1 text, 3:1 UI; never colour alone for state (applies to the Laser Lime on dark palette — test combinations).
- Target size ≥ 24×24 CSS px (WCAG 2.2) and ideally 44×44 on mobile.
- `prefers-reduced-motion`, `prefers-color-scheme`, `prefers-contrast` respected.
- Alt text on all images; decorative images `alt=""`.
- Test with keyboard-only, NVDA/VoiceOver/TalkBack, axe-core in CI, Lighthouse.

## 9. SEO and sharing (only verified facts)

- Unique `<title>`/meta description per page, canonical URLs, `lang="en"`, Open Graph/Twitter cards, `robots.txt`, `sitemap.xml`; `noindex` the admin and cart/checkout.
- Structured data (`LocalBusiness`, `Product`, `FAQPage`) **only after** business details, prices and availability are verified — wrong structured data can mislead customers and harm search visibility.
- Clean URLs and redirects for legacy pages (already generated by the build script); 404 page with navigation.

## 10. Privacy-friendly analytics

Prefer Plausible/Umami/Cloudflare Web Analytics (cookie-less). If using GA4 or Meta Pixel, load only after consent and update the privacy notice. Track conversions (enquiry submitted, newsletter confirmed), not personal data.

## 11. Frontend security reminders

- No secrets in code or `<meta>` (only API origin).
- Subresource Integrity (`integrity` + `crossorigin`) for any third-party script; prefer self-hosting.
- `rel="noopener noreferrer"` on external links.
- Do not render admin-provided URLs without protocol allowlist.
