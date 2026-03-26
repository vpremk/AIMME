## Auth0 configuration (AIMME)

The `web/` app uses `@auth0/nextjs-auth0`.

### Required web environment variables

Set these in `web/.env.local` (local) and in your deployment environment (e.g. Vercel):

- `AUTH0_SECRET`
- `AUTH0_ISSUER_BASE_URL` (e.g. `https://YOUR_TENANT.us.auth0.com`)
- `AUTH0_BASE_URL` (e.g. `http://localhost:3000` or your deployed URL)
- `AUTH0_CLIENT_ID`
- `AUTH0_CLIENT_SECRET`

### Imprint API (used for on-chain hazard logging)

When `POLYGON_SIGNING_MODE=vault`, the Next.js API routes request an Auth0 access token for the Imprint API audience and pass it to the Polygon signer microservice.

Configure an Auth0 API:

- **Identifier**: use this value as `AUTH0_IMPRINT_AUDIENCE`
- **Permissions**: include `imprint:alert` (or set `AUTH0_IMPRINT_PERMISSION` to your chosen permission name)

The signing service accepts authorization from any of:

- `permissions` array contains `imprint:alert`
- `scope` contains `imprint:alert`
- claim `https://aimme.app/can_imprint` (configurable via `AUTH0_CAN_IMPRINT_CLAIM`) is `true`

## Polygon signer microservice

The Polygon signer microservice lives in:

- `/Users/vamsi/opensource/aimme/services/polygon-signer`

It verifies the caller using:

- Optional `Authorization: Bearer ${SIGNER_SERVICE_API_KEY}` (service-to-service)
- `auth0_access_token` in the JSON body (user authorization via Auth0 JWKS)

