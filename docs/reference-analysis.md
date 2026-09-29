# Reference page analysis

Reference: https://www.vpslakeshorehospital.com/ai-clinical-practice-landing

Inspected the public HTML and assets on 29 September 2026. Browser automation was unavailable, so the reference analysis is based on source inspection rather than a rendered browser session.

## Structure and visual design

- Deep navy background (`#0A1020`), darker blue cards (`#101A30`), teal accents (`#2DD4BF`) and a deep teal footer.
- Sticky navigation, split hero with doctor/AI artwork, event information and repeated registration calls to action.
- Hospital logo, audience and takeaway cards, six syllabus accordions split between morning and afternoon.
- Instructor portrait and expanded biography, final registration prompt and support links.
- Modal form with first name, last name, email, phone, organisation, specialty and optional topic requests.
- Tailwind loaded from a CDN, Alpine for interactivity and Font Awesome icons. The form posts to a hospital backend endpoint; the source is not a Vite application.

## Findings that affect the rebuild

1. **No payment flow exists in the inspected page.** The modal collects an expression of interest. A paid registration needs an order, authoritative price, verified captured payment and persistent registration.
2. **The specialty input is incorrectly bound.** Its `x-model` points to `form.organization`, while validation requires `form.specialty`. This can overwrite the organisation and prevent submission.
3. **Date information conflicts.** Visible copy says date TBA; the script counts down to 29 October 2026 at 09:00 UTC. The rebuild uses one configured, timezone-aware date for display and countdown, and leaves it unset by default.
4. **There is no published registration fee.** The rebuild never invents a charge. The amount must be supplied server-side.
5. **Two modal control systems coexist.** Alpine state and an extra DOM click handler both change visibility, creating a risk of stale UI state. The rebuild uses React state and native dialogs.
6. **The host-icon asset has a fallback.** The valid main logo is reused locally, instead of relying on the alternate `/images/lakeshore-logo.png` path.

## Rebuild choices

The new page preserves the hospital/workshop identity, navy and teal palette, core sections, original hero and instructor portrait, with refreshed typography and spacing. It adds a short FAQ, clear registration states and a single source of truth for the fee and date. The timer shows dashes when the date is unconfirmed and never fabricates urgency. The syllabus descriptions are edited for clarity and avoid promising clinical accuracy or legal compliance from AI tools.

The Vite client calls its own Node API. The API keeps secrets on the server, ignores client amounts, validates attendee fields independently, verifies callbacks, checks payment capture and processes signed webhooks idempotently. Checkout remains closed until the fee, future event date, payment credentials and policy links are supplied. No forms submit to the reference hospital's existing registration endpoint.

## Asset sources

- Hero: https://vibe.filesafe.space/1782354680648716153/assets/cefb6dd8-c6f4-4f28-88fb-67aae269481c.png
- Instructor: https://vibe.filesafe.space/1778677307402717493/attachments/7979a85c-eedb-48eb-bda9-151878112803.jpg
- Logo: https://www.vpslakeshorehospital.com/img/logos/logo.png

## Still requires organiser input

Confirmed price, date, exact venue, payment credentials, published terms/privacy/refund policies and confirmation that the reference's support email should remain. Optional follow-up features include confirmation emails, GST invoices, capacity limits and an organiser dashboard.
