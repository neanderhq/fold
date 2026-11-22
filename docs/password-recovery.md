# Password recovery

Fold uses Better Auth's native password-reset flow and existing account,
verification and session tables. Links expire after 30 minutes, work once, and
successful reset revokes existing sessions. Passwords require 10–128 characters.
The sign-in screen links to `/forgot-password`; `/reset-password` confirms the
new password and asks the owner to log in again.

## Runtime configuration

Delivery is disabled by default. Configure your own server-side Resend key in
ignored local environment or deployment secrets; never put it in source, logs,
screenshots, browser variables or chat. Build and public health do not need it.

For restricted development delivery, set `PASSWORD_RESET_ENABLED=true`,
`PASSWORD_RESET_DELIVERY_MODE=preview`, `PASSWORD_RESET_FROM='Fold <onboarding@resend.dev>'`,
`PASSWORD_RESET_PREVIEW_RECIPIENT` to your own test inbox, and `RESEND_API_KEY`.
The preview recipient is an exact allowlist, not a destination for other owners'
reset mail. It must match an existing test owner. Enabling preview can send real
email; application tests inject delivery and must keep real credentials absent.

For production, verify a custom-domain sender with Resend, then set
`PASSWORD_RESET_DELIVERY_MODE=production`, `PASSWORD_RESET_FROM='Fold <no-reply@your-domain.example>'`,
`PASSWORD_RESET_SENDER_VERIFIED=true` and your own `RESEND_API_KEY`. Remove the
preview recipient. Enable only after testing your configured delivery and
session revocation. The sender-verification flag is an operator acknowledgement;
it does not query Resend. Production refuses `@resend.dev` senders.

Set `PASSWORD_RESET_ENABLED=false` to close recovery, including unused links.
Missing/incomplete configuration fails closed with a visible unavailable state.
Template seeds and publication never configure delivery or send email.

## Security behavior and tests

Known/unknown accounts receive the same confirmation. Delivery failures do not
expose provider responses or account existence; failed sends invalidate the token
best-effort. Next's `after` keeps work out of response timing but is not a durable
mail queue. A transient failure requires a fresh request.

Writes require the exact configured Origin. Redirects are fixed to that origin;
normal reset links carry tokens in a URL fragment and the client clears history
before submitting them. Preserve no-referrer headers and avoid analytics on
recovery pages. Never log bearer links or recipient/provider details.

Database-backed rate limits apply to normalized email addresses and client IPs.
Deployment proxies must strip/set forwarded-IP headers correctly. Missing trusted
IP information shares a conservative bucket; counters survive process changes.
Better Auth consumes tokens atomically and revokes sessions after success.

`pnpm test` includes gated-delivery/payload/error/origin regressions with synthetic
fixtures. `scripts/test-password-recovery.mjs` uses real Better Auth handlers and
an isolated PostgreSQL schema, dropping only that schema afterward. It never
sends external mail. Real inbox delivery and rendered email review are separate
operator checks; a provider HTTP response is not proof of inbox arrival.
