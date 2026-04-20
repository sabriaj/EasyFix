# Manual Regression Checklist

Use this after backend/frontend cleanup on `dev`.

Rules:

- stay on `dev`
- do not touch `main`
- do not push anything
- record any failing step before changing code

## Setup

1. Start the backend:
   `npm start`
2. Serve the frontend locally:
   `npx serve .`
3. Confirm `.env` points the frontend URLs to the local frontend server.
4. Keep browser devtools open for console/network failures.

## Client Flow

- [ ] Open `index.html`
- [ ] Confirm listings load without console errors
- [ ] Open `auth.html`
- [ ] Create or log into a client account
- [ ] Confirm client login redirects into the client flow correctly
- [ ] Open `account.html`
- [ ] Confirm account data loads
- [ ] Confirm profile update works
- [ ] Confirm password change works
- [ ] Confirm logout returns to `auth.html`

## Pro Flow

- [ ] Open `register.html`
- [ ] Complete pro registration with OTP flow
- [ ] Confirm created listing is `free` and active without forced payment
- [ ] Open `pro-login.html`
- [ ] Log into the pro account
- [ ] Confirm `pro-dashboard.html` loads
- [ ] Confirm profile update works
- [ ] Confirm media upload respects free-plan limits
- [ ] Confirm password change works

## Premium Flow

- [ ] Trigger premium checkout from the pro flow
- [ ] Confirm only `premium` is used
- [ ] Confirm checkout redirect is created successfully
- [ ] Return through `success.html`
- [ ] Confirm success page resolves listing state correctly
- [ ] Confirm premium state shows correctly in the dashboard

## Credits And Contact Flow

- [ ] Log into a client account
- [ ] Start credits purchase flow
- [ ] Confirm selected credits package creates checkout successfully
- [ ] After return, confirm credits are reflected on the account/index UI
- [ ] Unlock one pro contact
- [ ] Confirm one credit is spent
- [ ] Confirm duplicate unlock does not double-charge

## Owner Flow

- [ ] Open `manage.html` request-link flow or request from the owner endpoint path
- [ ] Confirm manage link email/request path succeeds silently for unknown emails
- [ ] Open valid owner link
- [ ] Confirm owner data loads
- [ ] Confirm owner updates save correctly
- [ ] Confirm invalid/expired token is rejected

## Delete Flow

- [ ] Open `delete.html`
- [ ] Request deletion link
- [ ] Open `delete-confirm.html` with a valid link
- [ ] Confirm delete completes successfully
- [ ] Confirm invalid/expired delete link shows a safe error

## General UI Checks

- [ ] `index.html`, `auth.html`, `pay.html`, `success.html`, `contact.html`, `privacy.html` load without broken navigation
- [ ] No visible mojibake or broken encoding on the tested pages
- [ ] Shared config routing works for all tested page-to-page navigation
- [ ] No obvious 401/403/500 failures in browser network logs for the expected happy paths

## After Manual Pass

1. Record failures with exact page and action.
2. Fix one issue set at a time.
3. Re-run:
   `npm run check:core`
4. Re-run:
   `npm run test:routes`
