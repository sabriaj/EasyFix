# EasyFix Session Handoff

This file is the saved local context for continuing the `dev` branch upgrade work if the terminal chat/session is lost.

## User Rules

- Work only on `dev`
- Do not touch `main`
- Do not push anything
- Treat this as a live marketplace, so prefer safe incremental changes

## Product Model To Keep

- Pros register for free
- Free pro accounts can appear on listings
- Clients register/login and contact pros using credits
- Premium is optional only:
  - more photos
  - higher ranking / boost
- Old subscription-era logic (`basic`, `standard`, forced subscription flow) should not be treated as the live business model

## Confirmed Current State

- Branch: `dev`
- Local work only
- `server.js` syntax check passes
- `lib/admin-routes.js` syntax check passes
- `npm run check:core` passes
- `npm run test:routes` passes with 19 route checks

## Important Changes Already Made

### Backend hardening

- Added security headers and CSP
- Added rate limiting
- Added validation helpers
- Moved admin auth/routes/helpers into `lib/`
- Added session-based auth for protected routes
- Added `/pro/rollback-signup`
- Added `npm run check:core` for quick local syntax verification of core backend files

### Frontend/config cleanup

- Added shared config in `easyfix-config.js`
- Many pages now use shared API/path handling
- `contact.html` and `privacy.html` were kept and updated, not removed
- For this `dev` workspace, frontend default API target should be:
  - `https://easyfix-dev-1.onrender.com`
  - do not default local frontend pages to production API

### Additional modularization done today

- Extracted pay/status routes into `lib/pay-now-routes.js`
- Registered pay/status route module from `server.js`
- Added route tests for:
  - pay-now request silent behavior
  - pay-now premium checkout creation
  - check-status visibility lookup

### Marketplace model alignment

- Pro signup is free
- `/register` creates listing state with:
  - `plan: "free"`
  - `payment_status: "active"`
- Premium checkout paths only support `premium`
- Shared i18n text was updated away from the old forced-subscription story

### Owner/payment flow work

- Added/cleaned:
  - `/owner/me`
  - `/owner/request-link`
  - `/owner/update`
  - `/check-status`
- `lib/owner-routes.js` exists and is registered from `server.js`

### Backend safety fixes made recently

- `/contact` now rejects deleted/non-visible firms instead of unlocking by raw `firmId`
- duplicate-contact fallback now also rejects deleted/non-visible firms
- Admin expire route now sets `payment_status: "expired"`
- Admin delete route is now a soft delete, not a hard delete
- Admin stats and admin firm lists now exclude soft-deleted firms by default
- Admin now has a restore route for soft-deleted firms
- Restoring a firm clears stale payment timestamps and boost state
- Admin manual edits now normalize state better:
  - `free` clears boost
  - `expired` clears boost and forces `free`
- Admin legacy migration no longer revives `expired` firms back to `active`
- webhook deliveries now have idempotency protection via `WebhookReceipt`
  - duplicate payment webhooks are ignored instead of re-applying credits/premium
- downgrade/refund webhook flow now clears stale premium expiry state too

## Known Remaining Cleanup

- Some HTML/email strings still have mojibake / broken encoding text
- `server.js` still has room for more modularization

## Confirmed Dev Deployment Problem Found Today

- Local frontend was tested via:
  - `http://127.0.0.1:5500/index.html`
- Browser config override may need clearing if behavior looks wrong:
  - `localStorage.removeItem("easyfix_api_url_override")`
- Contact unlock on deployed dev backend currently fails for all listings:
  - request: `POST https://easyfix-dev-1.onrender.com/contact`
  - response: `{"success":false,"error_code":"SERVER_ERROR"}`
- Render logs on deployed dev show:
  - `CONTACT ERROR: TypeError: Cannot read properties of null (reading 'role')`
- This strongly indicates the deployed Render dev service is still running stale `/contact` code or wrong code, because current local repo code does not use that old null-unsafe `/contact` path.
- The `npm audit` vulnerability line seen during deploy is not the cause of the `/contact` crash.

## Highest-Value Next Steps

1. Verify Render `easyfix-dev-1.onrender.com` is actually deploying the correct `dev` branch and latest commit
2. Re-check deployed `/contact` logs after deploy and compare with current repo route code
3. Continue modularizing `server.js`
4. Clean remaining user-visible mojibake / wording issues

## If A New Session Starts

Tell the assistant:

`Read SESSION-HANDOFF.md and UPGRADE-ROADMAP.md, then continue the EasyFix dev upgrade from there.`

That will recover the important context from disk even if chat memory is gone.
