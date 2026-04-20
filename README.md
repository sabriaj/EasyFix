# EasyFix

Demo: `https://sabriaj.github.io/EasyFix/`

## Local dev

1. Copy `.env.example` to `.env`
2. Fill in at minimum:
   `MONGO_URI`
3. Add the Lemon Squeezy variant IDs you actually use:
   `VARIANT_PREMIUM`, `VARIANT_CREDITS_1`, `VARIANT_CREDITS_5`, `VARIANT_CREDITS_10`
4. Install dependencies:
   `npm install`
5. Start the backend:
   `npm start`

For the frontend, serve the HTML files locally with a static server. Example:
`npx serve .`

If you use a different local frontend URL, update:
- `FRONTEND_BASE_URL`
- `FRONTEND_SUCCESS_URL`

## Verification

- Syntax/core backend check:
  `npm run check:core`
- Route-module regression checks:
  `npm run test:routes`
