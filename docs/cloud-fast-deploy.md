# Cloud Fast Cloudflare Deploy Runbook

Cloud Fast production runs as a Cloudflare Worker with a D1 database.
The desktop app talks to `https://api.dictivo.app`; provider keys stay in
Worker secrets.

## Files

- Worker entry: `apps/api/src/worker.ts`
- D1 schema: `apps/api/migrations/d1/0001_init.sql`
- Wrangler config: `wrangler.api.jsonc`

## One-time setup

Lemon Squeezy status:

- KYC / Live mode: **Pending** as of 2026-05-16.
- Current work should use Lemon Squeezy Test mode only.
- Live checkout URLs and marketing Buy buttons must wait until KYC is approved.

Current production D1:

- Name: `dictivo-api`
- Database ID: `e2a0c04c-c252-43ac-a4c7-336f13c7b8aa`
- Region: `WEUR`
- Initial schema migration: applied on 2026-05-16

Current Worker:

- Name: `dictivo-api`
- Custom domain: `https://api.dictivo.app`
- Workers.dev preview: `https://dictivo-api.yijie-ma94.workers.dev`
- Last verified health response: 2026-05-16
- Last verified real transcription smoke: 2026-05-16, Groq primary route returned transcript with `fallbackUsed: false`
- Last verified auth smoke: 2026-05-16, `/v1/cloud-fast/transcribe` rejects spoofed `x-user-id` without a signed Cloud Fast session token
- Compatibility date: `2026-05-15` (Cloudflare rejects dates that are still future in UTC)

1. Confirm Cloudflare auth:

   ```bash
   npx wrangler whoami
   ```

2. Create D1 only if the database above has been deleted or this is a new Cloudflare account:

   ```bash
   npm run d1:create -w @dictivo/api
   ```

3. Copy the returned `database_id` into `wrangler.api.jsonc`.

4. Apply the schema:

   ```bash
   npm run d1:migrate:remote -w @dictivo/api
   ```

5. Set Worker secrets:

   ```bash
   npx wrangler secret put GROQ_API_KEY --config wrangler.api.jsonc
   npx wrangler secret put ELEVENLABS_API_KEY --config wrangler.api.jsonc
   npx wrangler secret put CLOUD_FAST_SESSION_SECRET --config wrangler.api.jsonc
   ```

6. Optional: after the real Lemon Squeezy Cloud Fast product exists, lock
   Cloud Fast license validation to its product or variant IDs in
   `wrangler.api.jsonc`:

   ```jsonc
   "LEMON_SQUEEZY_CLOUD_FAST_PRODUCT_IDS": "123456",
   "LEMON_SQUEEZY_CLOUD_FAST_VARIANT_IDS": "789012"
   ```

   Leave these unset during Test mode if the product or variant name contains
   `Cloud Fast`. The Worker validates licenses through Lemon Squeezy's License
   API and does not need Stripe secrets for the Cloud Fast path.

## Deploy

The Worker skeleton is deployed. Redeploy after Groq and ElevenLabs
secrets have been set:

```bash
npm run deploy:worker -w @dictivo/api
```

Then verify:

```bash
curl https://api.dictivo.app/health
```

Expected response includes:

```json
{
  "ok": true,
  "service": "dictivo-api",
  "runtime": "cloudflare-workers",
  "database": "d1",
  "contentRetention": "none"
}
```

## Local Worker Dev

```bash
npm run d1:migrate:local -w @dictivo/api
npm run dev:worker -w @dictivo/api
```

The Fastify server is still available for Node-side regression tests, but
the production deployment path is the Worker.

## Cloud Fast License Sessions

The Worker no longer trusts `x-user-id` in production. Desktop clients
must call `POST /v1/cloud-fast/session` with the locally activated Lemon
Squeezy `licenseKey` and `instanceId`. The Worker validates the license
against Lemon Squeezy, confirms it belongs to a Cloud Fast product, upserts
D1 entitlement/quota state, and returns a one-hour signed Bearer token.
`/v1/cloud-fast/transcribe` requires that token.

The desktop keeps this activation in a dedicated Cloud Fast cache:
`~/Library/Application Support/Dictivo/cloud-fast-license.json` on macOS.
The Local perpetual/update license remains in `license.json`; do not use the
Local license cache to request Cloud Fast session tokens.

By default, the Worker accepts Lemon Squeezy licenses whose product or
variant name contains `Cloud Fast`. For a stricter launch configuration,
set one or both vars in `wrangler.api.jsonc` after the Lemon Squeezy
product exists:

```jsonc
"LEMON_SQUEEZY_CLOUD_FAST_PRODUCT_IDS": "123456",
"LEMON_SQUEEZY_CLOUD_FAST_VARIANT_IDS": "789012"
```

Then redeploy:

```bash
npm run deploy:worker -w @dictivo/api
```

Still needed before public launch: create the real Lemon Squeezy Cloud
Fast subscription product at $6.99/mo with license keys enabled, then run
one real activation → session → transcription smoke test from the packaged
desktop app.

## Marketing Checkout Route

The marketing site repository (`034_Dictivo_Site`) has a dedicated
`/cloud-fast` upgrade page. Its CTA points to `/checkout/cloud-fast`.
During KYC pending / Test mode, `_redirects` sends that route to the Lemon
Squeezy Test checkout URL.

Current Test checkout target:
`https://dictivo.lemonsqueezy.com/checkout/buy/36ca20c8-026c-4692-bf42-c95d66b909d2`

After KYC clears, replace it with the live checkout URL.
