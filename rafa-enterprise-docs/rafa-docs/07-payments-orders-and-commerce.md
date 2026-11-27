# 07 — Payments, Orders and Commerce (Kenya)

Status in the repo: the checkout is a **simulation**. Nothing here is live until RAFA confirms the business rules
(brief section 6) and the chosen provider approves onboarding. Items marked `[VERIFY]` must be checked against current
official provider documentation before implementation.

## 1. Decision: build or buy the payment layer

| Option | Pros | Cons |
|---|---|---|
| Direct Safaricom Daraja (STK Push, C2B) | Lowest per-transaction cost, M-Pesa native | You own callbacks, reconciliation, edge cases; needs Paybill/Till + onboarding; M-Pesa only |
| Aggregator (Paystack, Flutterwave, Pesapal, iPay, DPO) `[VERIFY each for KES, fees, settlement]` | M-Pesa + cards in one integration, hosted/tokenized card pages (PCI scope reduced), dashboards, refunds | Higher fees, provider dependency |
| Hosted commerce platform (Shopify etc.) | Cart, stock, orders, taxes built in | Less control, would replace the custom store |

**Recommendation:** start with one aggregator for M-Pesa + cards behind an internal `PaymentProvider` interface; add
direct Daraja later if volume justifies the fee savings. The interface keeps both swappable.

```
interface PaymentProvider {
  initiate({ orderId, amountMinor, currency, customer, idempotencyKey }) -> { providerRef, nextAction }
  query(providerRef) -> { status, amountMinor, receipt }
  parseWebhook(rawBody, headers) -> verified event | throws
  refund({ providerRef, amountMinor, reason, idempotencyKey })
}
```

## 2. Card handling (PCI)

- Never receive, log, or store PAN/CVV. Use provider-hosted fields or redirect pages (tokenization). This keeps you at the lightest PCI DSS SAQ level (typically SAQ A) `[VERIFY with provider]`.
- The current demo card fields must be **removed** from the public UI before real payments launch.
- No third-party scripts on the payment step beyond the provider's.

## 3. M-Pesa STK Push flow (Daraja) `[VERIFY endpoints, fields, IPs]`

1. Customer places order → server creates `orders` row (`pending_payment`) with server-computed total.
2. Server requests an OAuth token (cache until near expiry), calls STK Push with: shortcode, timestamp, password (base64 of shortcode+passkey+timestamp), amount, phone (`2547XXXXXXXX`), `CallBackURL`, account reference = order public id.
3. Store `payments` row (`initiated`) with `CheckoutRequestID` and `MerchantRequestID`.
4. Customer approves on phone. Safaricom POSTs the result to your callback.
5. Callback handler: authenticate (below), parse `ResultCode`, match `CheckoutRequestID`, compare **amount and account reference** to the order, store the raw event in `payment_events`, then transition state in a transaction.
6. If no callback within ~60–90 s: call **STK Push Query** with `CheckoutRequestID`; mark `expired` if still unresolved after a window; never assume success.
7. Customer UI polls `GET /orders/:publicId` (every 3 s, back off, max ~2 min) for status; success page reads server state only.

Callback authentication (Safaricom does not sign callbacks with an HMAC `[VERIFY]`):
- Unguessable path secret in the callback URL (`/webhooks/mpesa/<random 32 bytes>`), rotated periodically.
- Allowlist Safaricom source IP ranges at the edge/app `[VERIFY current list]`.
- Verify by re-querying the transaction status API before marking paid (treat the callback as a hint).
- Accept only HTTPS, small body (≤ 16 kb), strict schema.
- Respond `200 {"ResultCode":0,"ResultDesc":"Accepted"}` quickly; do heavy work asynchronously.

## 4. Webhook rules (any provider)

- Verify signature over the **raw body** (`express.raw` for that route) using constant-time compare; check timestamp tolerance (≤ 5 min) to block replays.
- Idempotent: unique constraint on `(provider, provider_event_id)`; duplicates are acknowledged and ignored.
- Out-of-order safe: state machine only moves forward; late "pending" after "succeeded" is ignored.
- Always store the raw event for audits and disputes.
- Never reveal internal errors to the sender; retry semantics follow the provider's (return 5xx only for transient errors).

## 5. Order state machine

```
draft(cart, browser) ──checkout──▶ pending_payment ──payment succeeded──▶ paid ──▶ processing ──▶ shipped/ready ──▶ delivered/collected
        │                               │                                   │
        │                               ├─ payment failed/expired ─▶ payment_failed (retry allowed) ─▶ cancelled
        │                               └─ cancelled by customer/staff ─▶ cancelled
        └─ stock reservation expires ─▶ cancelled                          paid/processing ─refund─▶ partially_refunded | refunded
```

- Transitions defined in one table in code; any other transition throws.
- Each transition writes `order_events(order_id, from, to, actor, reason, at)`.
- Only server code driven by verified events or authenticated staff can transition.
- `payments` separate from `orders` (an order may have several attempts).

## 6. Stock and reservations

- Per-variant `stock_on_hand` and `reserved`. On order creation, reserve inside a transaction (Postgres: `UPDATE ... SET reserved = reserved + $q WHERE stock_on_hand - reserved >= $q`, check affected rows).
- Reservation TTL (e.g. 15 min) released by a job if unpaid; commit (decrement `stock_on_hand`) on payment success.
- The browser cart stores variant IDs and quantities only; **the server recomputes prices, availability and totals** at quote and order time.
- Show "price/stock changed" prompts at checkout when quotes differ from the cart.

## 7. Delivery pricing

Model zones (e.g. Nairobi CBD, Nairobi suburbs, rest of Kenya) with fee rules and thresholds; quote returned by `/checkout/quote`. Until RAFA defines them, UI must label totals "excluding delivery" (as the brief states).

## 8. Money and tax

- Integer minor units, currency `KES`; rounding rule defined once; VAT inclusive/exclusive decision `[VERIFY with accountant/KRA requirements, including eTIMS obligations]`.
- Receipts generated server-side after payment success; PDF or HTML email; includes order ID, items, totals, payment reference.

## 9. Reconciliation and finance operations

- Daily job compares provider settlement/transaction reports with `payments`; discrepancies create admin tasks.
- Admin: order list, payment timeline, manual "mark as paid (with reason + second approver for amounts over X)", refund workflow with audit log.
- Alert on: paid orders without a provider receipt, provider receipts without orders, payments pending > 30 min.

## 10. Fraud and abuse controls

- Rate limits per IP/order/phone on initiation; limit STK pushes per phone (e.g. 3/hour) to prevent harassment-via-prompt.
- Amount limits per order until trust is established; velocity checks; block mismatched currency.
- Do not reveal whether a phone number is registered.
- Disputes: keep evidence (events, delivery proof).

## 11. Events and desserts (non-cart commerce)

- Events: enquiry → qualification → quote → deposit link (payment request) → contract acceptance → milestone payments. Model as `celebration_requests` with `quotes` and `payment_requests`; deposits use the same payment layer.
- Desserts: lead-time calculator (e.g. minimum 48 h), daily capacity table, pickup/delivery slot, customization notes; payment as deposit or on confirmation.

## 12. Acceptance criteria for go-live

- [ ] Sandbox end-to-end: success, failure, timeout, wrong amount, duplicate callback, replayed callback.
- [ ] Reconciliation job verified against a day of real small transactions.
- [ ] Refund path tested.
- [ ] Demo card fields and fake receipts removed.
- [ ] Terms, returns, delivery and privacy policies published and linked at checkout.
- [ ] Alerting for payment anomalies active.
