# Connecting your Etsy shop

This assumes your Etsy shop is already open, verified, and able to sell.
Everything below is the one-time setup only a human can do — API
credentials, OAuth approval, and secrets. Do these in order.

## 1. Create an Etsy Developer app

1. Go to **https://www.etsy.com/developers/register** and sign in with the
   same Etsy account that owns your shop.
2. Click **Create a New App**.
3. Fill in the app name (anything, e.g. "My Shop Autopilot") and a short
   description.
4. For **Callback URL**, enter:
   - Local development: `http://localhost:4000/api/etsy/oauth/callback`
   - Production: `https://<your-api-domain>/api/etsy/oauth/callback`
   (This must exactly match `ETSY_OAUTH_REDIRECT_URI` in your `.env`.)
5. Submit. You'll land on your app's page.

## 2. Copy your API key into `.env`

1. On your app's page, find **Keystring** (this is your API key).
2. Open `.env` in this repo (copy from `.env.example` if you haven't yet).
3. Set:
   ```
   ETSY_API_KEYSTRING=<paste the Keystring here>
   ```
4. Also set a random encryption key (used to encrypt your Etsy tokens at
   rest) and session secret if you haven't already:
   ```bash
   openssl rand -base64 32   # paste as ENCRYPTION_KEY
   openssl rand -base64 48   # paste as SESSION_SECRET
   ```
5. Restart the API server (`pnpm dev:api`, or `docker compose restart api`
   in production) so it picks up the new values.

## 3. Set your admin login

1. Set `ADMIN_EMAIL` in `.env` to the email you'll log into the dashboard
   with.
2. Generate a password hash:
   ```bash
   pnpm --filter @etsymagazam/api run hash-password "your-chosen-password"
   ```
3. Paste the printed hash into `ADMIN_PASSWORD_HASH` in `.env`.
4. Restart the API server.

## 4. Authorize the app to your shop

1. Open the dashboard (`http://localhost:3000` locally, or your production
   URL) and log in.
2. Go to **Settings**.
3. Click **Connect Etsy**.
4. You'll be sent to Etsy's own consent screen. Review the permissions and
   click **Allow Access** (or similar wording).
5. You'll be redirected back to the dashboard. Settings should now show
   the connection as active.

Behind the scenes this used OAuth 2.0 with PKCE — your Etsy password is
never seen by this app, and the access/refresh tokens it receives are
encrypted before being stored and refreshed automatically before they
expire.

## 5. Verify the connection actually works

From the dashboard's Settings page (or directly):
```bash
curl -X POST http://localhost:4000/api/etsy/oauth/verify \
  -b "etsy_autopilot_session=<your session cookie>"
```
This pings Etsy, looks up your shop, and reports your remaining daily API
quota. If it fails, double-check step 2 (API key) and step 4 (that you
actually clicked Allow, not Deny).

## 6. Fill in your Etsy category (taxonomy) IDs

Every listing needs a numeric `taxonomy_id`. This system refuses to guess
one — you fetch the real list once:

```bash
pnpm tsx scripts/fetch-etsy-taxonomy.ts
```

This prints Etsy's full category tree (and saves it to
`scripts/output/etsy-taxonomy-dump.json`). Find the category that matches
each niche you plan to sell in, then edit
`apps/worker/src/config/etsy-taxonomy.json`, replacing the `null` values
with the real numeric ids, e.g.:

```json
{
  "categoryToTaxonomyId": {
    "wedding": 1250,
    "baby": 1251
  }
}
```

Until a category has a real id here, the Publisher Agent will block
publishing for that category (and tell you why) rather than guess.

## 7. (Optional) Set up order webhooks

Etsy's official webhooks give you near-real-time order notifications
instead of waiting for the scheduled poll. This is optional — the system
polls your shop's receipts on a schedule regardless, so orders are never
missed even without this step.

1. In the Etsy Developer Portal, open your app, click the menu, and choose
   **Go to Webhook portal**.
2. Click **+ Add Endpoint**.
3. Callback URL: `https://<your-api-domain>/api/etsy/webhooks`
   (must be HTTPS in production; Etsy cannot reach `localhost`, so this
   step only works once you've deployed).
4. Select the events you want (`order.paid`, `order.canceled`,
   `order.shipped`, `order.delivered`).
5. Click **Create**. Etsy shows you a signing secret starting with
   `whsec_`.
6. Copy it into `.env`:
   ```
   ETSY_WEBHOOK_SIGNING_SECRET=whsec_...
   ```
7. Restart the API server.

## 8. Turn it on

By default the system starts **paused** and in **DRY_RUN** mode — it will
research and generate products but never actually call Etsy's write
endpoints. Once you've reviewed a few DRY_RUN runs from the dashboard and
you're happy:

1. Go to **Settings**.
2. Turn off `DRY_RUN`.
3. Decide on `AUTO_PUBLISH`: on means QA-passed products go live
   automatically; off means they're created as Etsy drafts for you to
   review and activate by hand.
4. Click **Resume Autopilot**.

You're done. See `docs/AUTOPILOT.md` for what happens next, and the
**PAUSE AUTOPILOT** button in Settings any time you want to stop it.
