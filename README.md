# AI in Clinical Practice

A responsive React + Vite landing page matching the VPS Lakeshore Hospital workshop branding, with a Node/Express backend for Razorpay INR payments.

## Run locally

Requires Node.js 24 or newer (the backend uses built-in SQLite).

```powershell
npm.cmd install
Copy-Item .env.example .env
npm.cmd run dev
```

Open **http://localhost:5173**. On macOS/Linux, use `npm` instead of `npm.cmd` and `cp .env.example .env`. `npm run dev` starts both Vite and the payment API. The page works without credentials; checkout stays closed until configured.

## Enable Razorpay test checkout

Set these **server-only** values in `.env`. Do not commit `.env` or paste secrets into frontend code.

| Variable | Value |
| --- | --- |
| `RAZORPAY_KEY_ID` | Your Razorpay test key ID |
| `RAZORPAY_KEY_SECRET` | Its secret |
| `RAZORPAY_WEBHOOK_SECRET` | The secret you choose for your webhook |
| `WORKSHOP_PRICE_INR` | Final price in rupees, e.g. `2500.00`; this is illustrative, not an agreed fee |
| `WORKSHOP_STARTS_AT` | Confirmed ISO date and timezone, e.g. `2026-11-15T09:00:00+05:30`; illustrative only |
| `WORKSHOP_VENUE` | Confirmed venue |
| `TERMS_URL`, `PRIVACY_URL`, `REFUND_URL` | Your published HTTPS policy URLs |
| `SUPPORT_EMAIL` | Monitored organiser email; the current default comes from the reference |
| `PUBLIC_ORIGIN` | Exact frontend origin; production should use HTTPS |

Restart the dev command after changing `.env`. The price is the total amount charged, inclusive of any taxes you need to collect. No additional tax is calculated by this starter.

In Razorpay, enable automatic payment capture. Register a webhook at:

```text
https://YOUR-DOMAIN/api/payments/webhook
```

Subscribe to `payment.captured` and `order.paid`, using the same webhook secret as your environment. Local webhook delivery requires a publicly reachable development endpoint. Test successful, failed, cancelled and delayed payments using Razorpay test mode. No real payments were made while building this project.

The integration follows [Razorpay Standard Checkout](https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/integration-steps/) and [webhook validation](https://razorpay.com/docs/webhooks/validate-test/).

## Payment flow

1. The browser submits attendee details and policy consent to `POST /api/payments/orders`.
2. The server validates the details, sets the authoritative price, creates a Razorpay order and stores the registration in SQLite.
3. The browser opens Razorpay Checkout; payment credentials are handled by Razorpay.
4. `POST /api/payments/verify` verifies the HMAC against the stored order, fetches the payment from Razorpay, and checks the order, currency, amount and captured status.
5. Signed webhooks also confirm payments if the customer closes the page. Duplicate webhook processing is transactional and idempotent.
6. `POST /api/payments/status` reconciles pending payments with Razorpay. A secret per-registration token protects status access.
7. After a verified captured payment, the browser fills and submits a hidden multipart HTML form to the supplied Zoho Forms endpoint. Zoho displays its submission result. The original Zoho field names are preserved: `SingleLine` receives the hospital, `SingleLine2` receives medical specialty, and `SingleLine1` receives JSON containing the captured status, Razorpay payment ID and order ID. No payment-status text field is shown. Pending or rejected payments do not submit to Zoho.

Zoho submission requires the browser to remain open (or return and check payment status after a missed callback). Webhooks confirm payment in SQLite but do not submit the browser form. Zoho receipt is separate from payment verification; inspect Zoho’s result page for validation errors. The HTML endpoint provides no local delivery acknowledgement or deduplication, so check Zoho before manually resubmitting a paid registration. A full integration test needs a Razorpay test payment and confirmation that the corresponding record appears in Zoho.

Pending checkout details survive refreshes in the same browser tab using session storage. Customers can resume the existing order instead of creating another one. Confirmation is downloadable as text; it is not a tax invoice. There is no automated email delivery, refunds UI, registration admin UI or seat-capacity system yet. A tab closed before downloading confirmation requires organiser support, using the Razorpay payment reference.

## Build and host

```powershell
npm.cmd test
npm.cmd run build
npm.cmd start
```

The Express server serves `dist/` and the API on port **3001**. Deploy the complete Node app, not just the static Vite bundle. Use Node 24+, `NODE_ENV=production`, a persistent `DATABASE_PATH`, and HTTPS through your host/reverse proxy. Set `HOST=0.0.0.0` only if required by your container host; default is loopback. Set `PUBLIC_ORIGIN` to the public site URL and `TRUST_PROXY_HOPS` to your actual proxy topology so IP rate limiting works correctly. Switch to live Razorpay credentials only after test-mode checkout and webhook delivery have passed.

SQLite is suitable here for a single server instance with persistent storage. Back up its database, restrict access to the attendee data, and establish a retention process. For multiple instances or ephemeral/serverless hosting, migrate to a shared database and distributed rate limiting before launch. Keep the database and `.env` out of `public/` and `dist/`.

## Customisation

- `src/App.jsx`: sections, branding, instructor and hero.
- `src/content.js`: six syllabus modules and FAQs.
- `src/styles.css`: navy/teal theme, typography and responsive layout.
- `src/Registration.jsx`: registration, checkout, recovery and confirmation.
- `server/`: payment API, configuration, signatures and persistent storage.
- `docs/reference-analysis.md`: reference findings and implementation differences.

Images were downloaded from the user-provided reference page for the requested matching brand. Their source URLs are in the analysis document. Confirm your right to publish the hospital branding, portrait and imagery before public deployment. Fonts are bundled locally through Fontsource packages.

## Verification

`npm test` covers amount tampering, validation, signature failures, capture checks, webhook retries, pending-payment recovery and access controls using a mocked gateway. `npm run build` bundles the frontend. Live Razorpay end-to-end testing needs your test credentials and a reachable webhook URL; automated tests do not replace it.
