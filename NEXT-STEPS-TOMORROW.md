# Next Steps Tomorrow

Start by reading:

- `SESSION-HANDOFF.md`
- `UPGRADE-ROADMAP.md`
- `MANUAL-REGRESSION-CHECKLIST.md`

Hard rules:

- work only on `dev`
- do not touch `main`
- do not push anything
- prefer safe incremental changes

## Strict Remaining Checklist

### P0 - Final consistency and regression safety

- [ ] Confirm Render service for `easyfix-dev-1.onrender.com` is deploying the correct `dev` branch and latest commit hash
- [ ] Reproduce `/contact` on deployed dev and inspect Render logs again
  - current deployed error:
    `CONTACT ERROR: TypeError: Cannot read properties of null (reading 'role')`
  - this does not match the current local repo `/contact` code path
- [ ] Keep `easyfix-config.js` default API target on dev as:
  - `https://easyfix-dev-1.onrender.com`
- [ ] If browser behavior looks stale, clear:
  - `localStorage.removeItem("easyfix_api_url_override")`
- [ ] Run a manual browser check of the core flows after the latest cleanup:
  - use `MANUAL-REGRESSION-CHECKLIST.md`
  - client signup/login/account
  - pro signup/login/dashboard
  - premium checkout -> success return
  - credits purchase -> contact unlock
  - owner request-link -> manage flow
- [ ] Fix any user-visible broken text still found during that pass
- [ ] Verify all page navigation still works under `easyfix-config.js`

### P1 - Backend cleanup still worth doing

- [ ] Continue splitting `server.js` into smaller modules
- [x] Extract pay/status routes into `lib/pay-now-routes.js`
- [ ] Reduce misleading legacy comments / naming that still imply the old forced-trial model
- [ ] Review compatibility branches that still accept legacy `paid` / `trial` status values and keep only the ones still needed for old data

### P1 - Minimal test coverage still missing

- [x] Admin firm soft delete / restore / mark-paid
- [x] Contact unlock happy path / duplicate fallback
- [x] Payment webhook duplicate / credits / premium upgrade / refund downgrade
- [x] Add one test for owner link validation failure or expired token behavior
- [x] Add one auth/session middleware test
- [x] Add pay-now / check-status route tests

### P2 - Product-model cleanup

- [ ] Remove remaining old subscription-era wording or dead branches if confirmed unused
- [ ] Decide whether old `trial_*` fields/status support should stay only as migration compatibility or be removed later
- [ ] Keep the live model consistent everywhere:
  - free pro listing is active
  - premium is optional only
  - client contact is credit-based

### Verification commands

- `npm run check:core`
- `npm run test:routes`

Current important state:

- free pro listings are the live model
- premium is optional only
- admin delete is soft delete
- admin restore exists
- admin stats/lists hide deleted firms by default
- payment webhooks now have idempotency protection
- local checks pass:
  - `npm run check:core`
  - `npm run test:routes`
- deployed dev `/contact` is still broken until Render is confirmed to be running the correct latest code
