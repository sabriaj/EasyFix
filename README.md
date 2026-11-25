# EasyFix

Demo: `https://sabriaj.github.io/EasyFix/`

## Local dev

1. Copy `.env.example` to `.env`
2. Fill in at minimum:
   `MONGO_URI`
3. Add your AgentaOS test API key and webhook secret:
   `AGENTAOS_API_KEY`, `AGENTAOS_WEBHOOK_SECRET`
4. Confirm the AgentaOS product link IDs in `.env`:
   `AGENTAOS_PRODUCT_PREMIUM`, `AGENTAOS_PRODUCT_CREDITS_1`, `AGENTAOS_PRODUCT_CREDITS_5`, `AGENTAOS_PRODUCT_CREDITS_10`
5. Lemon Squeezy variables remain available for the legacy routes during the migration:
   `VARIANT_PREMIUM`, `VARIANT_CREDITS_1`, `VARIANT_CREDITS_5`, `VARIANT_CREDITS_10`
6. Install dependencies:
   `npm install`
7. Start the backend:
   `npm start`

For the frontend, serve the HTML files locally with a static server. Example:
`npx serve .`

If you use a different local frontend URL, update:
- `FRONTEND_BASE_URL`
- `FRONTEND_SUCCESS_URL`

## AgentaOS test mode

- Use an `sk_test_` API key and the AgentaOS test webhook signing secret in local `.env`.
- In AgentaOS Test Mode, register an HTTPS webhook URL ending in `/agentaos/webhook`. AgentaOS does not deliver events to localhost; expose the local backend through an HTTPS tunnel.
- Set `FRONTEND_BASE_URL` and `FRONTEND_SUCCESS_URL` to HTTPS URLs reachable by the buyer flow (use the tunnel or a local HTTPS frontend), and make sure the backend allows the frontend origin.
- Confirm all four `AGENTAOS_PRODUCT_*` values are the product link IDs shown in AgentaOS, not the public `/pay/<token>` URL suffix.
- Pay using `4242 4242 4242 4242`, any future expiry, and any CVC. Verify the webhook and resulting user/Firma records in the local database.
- Test and live data are separate. A test key processes only test data; the webhook handler also checks `livemode` against the API key prefix.

AgentaOS does not list a refund webhook in its documented event catalog. Disputes are recorded for reconciliation, but EasyFix does not automatically remove credits or downgrade Premium on a dispute/refund. Resolve refunds through AgentaOS and reconcile manually; do not set a credit balance below zero. Legacy Lemon Squeezy backend routes and webhook remain available during cutover, but customer checkout entry points now use AgentaOS.

## Verification

- Syntax/core backend check:
  `npm run check:core`
- Route-module regression checks:
  `npm run test:routes`
