# EasyFix Upgrade Roadmap

This file tracks the local-only `dev` branch upgrade work in progress.

## Current Focus

- Backend hardening is partially done:
  - shared auth middleware
  - admin route extraction
  - rate limiting
  - input validation
  - security headers and CSP
- Frontend migration is partially done:
  - shared API config via `easyfix-config.js`
  - protected requests now send session auth on key pages
  - remaining path and consistency cleanup is still in progress
- Marketplace model alignment is now clearer:
  - pro accounts and listings register for free
  - listing creation writes `plan: "free"` and `payment_status: "active"`
  - premium is treated as an optional upgrade for more photos and higher ranking
  - client contact remains credit-based

## Current Local State

- Done on `dev` only:
  - owner routes are registered through `lib/owner-routes.js`
  - payment/status flow has `/owner/me`, `/owner/update`, `/owner/request-link`, `/check-status`
  - `pay.html` now defaults to `premium` and blocks checkout unless the plan is exactly `premium`
  - shared i18n text has been updated away from the old forced-subscription story
- Still pending cleanup:
  - hidden `basic` / `standard` buttons still exist in `pay.html` markup but are inert
  - one disabled dead branch still exists in `success.html`
  - some mojibake/encoding text still exists in HTML files and email copy

## Finish Path

1. Finish frontend path consistency
- Remove absolute root redirects like `"/auth.html"` and `"/"` from all pages.
- Route every page through `window.EASYFIX_CONFIG.pagePath()` / `goToPage()`.
- Verify the app works both on custom domain root and GitHub Pages subpath deployment.

2. Complete frontend config adoption
- Bring `auth.html` into the shared config model.
- Review `contact.html` and `privacy.html` for consistency, even if they do not call the API.
- Remove leftover environment-specific conditions that are no longer needed.

3. Verify protected flows end-to-end
- Client signup/login/account flow
- Pro signup with OTP and rollback flow
- Pro free registration creates an active listing with no subscription requirement
- Pro dashboard load/update/media upload
- Credits checkout flow
- Contact unlock flow
- Owner manage link flow
- Success/checkout return flow

4. Clean remaining backend inconsistencies
- Review owner-management routes and success-status routes for validation and auth consistency.
- Continue splitting `server.js` into route modules.
- Replace any duplicated validation/auth logic still left inline.
- Review remaining trial-era reminder/status code and keep only what still matches the live business model.

5. Improve operational safety
- Add a real test script and basic integration coverage for auth/protected routes.
- Replace in-memory rate limiting if multi-instance deployment becomes a goal.
- Review Cloudinary upload limits and error handling.

6. Cleanup and release readiness
- Fix broken text encoding in pages/emails.
- Remove dead code and obsolete deployment checks.
- Remove inert old-plan UI blocks once exact-file cleanup is safe.
- Add local dev and test commands to `package.json`.

## Definition Of Done

- All main pages load from one shared config/path model
- Protected actions require valid session auth consistently
- Main user and pro flows work locally without manual patching
- `server.js` is reduced further and the route layout is clearer
- A minimal verification pass exists for the critical flows
