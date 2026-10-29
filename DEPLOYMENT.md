# Deploy Password Manager with Vercel Services

Production website: **https://passwordmanager.sushandahal.com.np**

Production API: **https://passwordmanager.sushandahal.com.np/api**

One Vercel project deploys the Next.js web app (`apps/web`) and Hono API
(`apps/api`) from the root `vercel.json`. The extension is built separately.
Services is currently a Vercel beta; use a preview deployment to verify the
platform build and routing before promoting production.

## 1. Prepare the databases

Use Node **24.x** (`.nvmrc`). Install from the repository root with `npm ci`.

- **Application database:** use the existing Neon primary connection as
  `DATABASE_URL`. For an existing installation, back it up and ensure the SQL
  migrations in `apps/api/migrations/` have been applied in date order. They
  include legacy session expiry caps and verification-token cleanup. Do not
  rerun them blindly on every deploy. For an entirely empty database, create
  the schema from `apps/api/src/db/schema.ts` using `drizzle-kit push` from
  `apps/api` with that database's `DATABASE_URL`, then review/apply the SQL
  migrations. Never run schema push against an existing production database
  without reviewing its proposed changes.
- **Logout protection database:** create a separate Neon project and use its
  **primary** connection as `REVOCATION_DATABASE_URL`. In that database's SQL
  editor, run `apps/api/migrations/revocations/20261028_shared_revocations.sql`.
  This script is repeatable and creates only the revocation table/index.
  Do not run the application's schema push here. Keep this connection server-only.

The independent store preserves logout revocations when application-database
deletions fail. Every API instance checks committed tombstones without a local
cache. Storage lookup failures deny authenticated requests with 503. A failed
logout still clears the browser cookie, but cannot promise server-side revocation
if both databases are unavailable; the API returns an error in that case.

Revocation records last seven days, exceeding the application's 24-hour session
lifetime. They remain after successful session deletion, so Vercel needs neither
a persistent filesystem nor a repeating retry timer. Optional housekeeping:

```sql
DELETE FROM session_revocations WHERE expires_at <= now();
```

Do not delete unexpired records or restore this store to an older snapshot while
keeping old sessions valid. When migrating an already running installation,
invalidate its existing sessions during cutover so local pending revocations
cannot be lost. This logs existing users out and should be scheduled deliberately.

## 2. Configure Resend and Arcjet

In Resend, add `mail.sushandahal.com.np`, copy the exact requested DNS records to
Cloudflare, and wait for verification. Use `security@mail.sushandahal.com.np` as
the sender. Creating a sending address does not create an inbox for replies.

In Arcjet, obtain the SDK request-protection key for the production site/project. The API already
enforces distributed rate limits. Production requires `ARCJET_MODE=LIVE`; do not
set `ARCJET_ENV=development`. Arcjet errors fail closed for protected operations;
logout retains its separate safety path.

Generate `ARCJET_IDENTITY_KEY` locally:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

For a new installation, run the command again for a **different**
`MFA_ENCRYPTION_KEY`. For an existing installation, preserve its current MFA key
or enrolled users will lose access to their MFA secrets. Keep both keys stable
across deployments and back them up privately.

## 3. Import the monorepo into Vercel

1. Import this Git repository as **one** new Vercel project.
2. Keep **Root Directory at the repository root** (`.`), not `apps/web` or
   `apps/api`. The root configuration declares each service and its framework.
3. Select **Node.js 24.x**. Leave project-level build/install/output overrides
   unset: Services owns per-service builds, and npm workspaces use the root
   lockfile plus `packages/*` and `config/*` dependencies.
4. Enable system environment variables if disabled. The API uses Vercel's
   `VERCEL=1` marker for shared-storage enforcement, trusted IP extraction and
   tracked post-response email work. Do not manually spoof this marker locally.
5. Add the following **Production** environment variables, then deploy.

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_API_URL` | `/api` (also the production default when omitted) |
| `WEB_ORIGIN` | `https://passwordmanager.sushandahal.com.np` (no trailing slash or `/api`) |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Application Neon primary connection |
| `REVOCATION_DATABASE_URL` | Independent revocation Neon primary connection |
| `RESEND_API_KEY` | Production Resend sending key |
| `EMAIL_FROM` | `security@mail.sushandahal.com.np` |
| `ARCJET_MODE` | `LIVE` |
| `ARCJET_KEY` | Production Arcjet site key |
| `ARCJET_IDENTITY_KEY` | Stable random 64-character hex key |
| `MFA_ENCRYPTION_KEY` | Persistent 64-character hex MFA encryption key |
| `EXTENSION_ORIGINS` | Exact approved `chrome-extension://<id>` origins, comma-separated; omit if not using the extension |

Leave `TRUSTED_PROXY_IPS`, `SECURITY_STATE_DIR`, and `ARCJET_ENV` unset on Vercel.
Never prefix database, email, Arcjet or encryption secrets with `NEXT_PUBLIC_`
or `VITE_`. The browser only needs the public `/api` base path.

Preview deployments need separate databases/keys and an exact `WEB_ORIGIN`
matching the preview's address (a stable preview domain is simplest). They still
run production-mode checks, including LIVE Arcjet. Do not share production
databases with untrusted preview code. `/api` automatically follows the preview
host; the origin allowlist intentionally does not trust arbitrary Host headers.

## 4. Connect the Cloudflare-managed domain

In Vercel **Settings → Domains**, add `passwordmanager.sushandahal.com.np`.
In Cloudflare DNS, add the exact record Vercel shows for `passwordmanager`.
Use **DNS only (grey cloud)** for the web/API record. Vercel terminates HTTPS;
placing Cloudflare's proxy in front would change which client IP Vercel sees.
There is no separate DNS record for `/api`, and no `api` subdomain is required.

Keep existing root-domain and mail records. Add Resend's records at the exact
names it specifies; use DNS-only for any verification CNAMEs. Wait for Vercel's
domain verification and HTTPS certificate before testing sign-in.

## 5. Build the extension (optional)

Create `apps/extension/.env.production.local`:

```env
VITE_API_ORIGIN=https://passwordmanager.sushandahal.com.np/api
```

Run `npm run extension:build`, then load/publish `apps/extension/dist` as usual.
Add its actual extension ID to the API's `EXTENSION_ORIGINS`. The bundled
development ID is `aeklikmljjjbhgmhofhhmbimkmeajigp`; confirm the installed or
store-distributed ID before allowing it. Extension requests still require their
own CORS/origin allowlist even though website requests are same-origin.

## 6. Verify before production promotion

From the repository root on Node 24:

```sh
npm run typecheck
npm test
npm run build
npm run test:security --workspace=web
```

On a configured preview/staging deployment, verify:

- `/` serves the web app. `/api/user/me` returns JSON **401** without a session;
  `/api` itself is deliberately a 404, not a health page.
- Registration sends an email with a link to the configured web origin.
  Verification, login, MFA, vault read/write and account changes work.
- Login sets a Secure, HttpOnly, SameSite=Lax cookie; authenticated requests use
  `/api/...` and never localhost. Responses have `Cache-Control: no-store`.
- Logout clears the cookie and the old cookie cannot authenticate on another
  API instance. In staging, make the main deletion fail and verify the shared
  revocation still blocks the old session; make revocation lookups fail and
  verify authenticated requests return 503 rather than bypassing the check.
- Arcjet records traffic and excess requests return 429. Forged origins return
  403. Confirm real client IPs with Cloudflare set to DNS-only.
- The extension connects using its approved origin and prefixed API URL.

`npm run dev` continues to run the website on localhost:3000 and the standalone
API on localhost:3001 using the existing local environment files. No deployment,
DNS update, or database migration is performed by these source changes.

The browser check uses fixture responses at the same-origin `/api` URL and does
not contact Neon or Resend. If deliberately testing a build with a different
`NEXT_PUBLIC_API_URL`, pass the matching `TEST_API_URL` to the browser check.

## Implementation notes

- `src/vercel.ts` exports a Hono app without opening a port or starting timers.
- `src/vercelApp.ts` strips `/api` once, before the existing API middleware.
  Security rules still see `/auth/login`, `/vault`, etc.; local routes are unchanged.
- Registration delivery is registered with Vercel `waitUntil`, bounded by the
  email timeout and function duration. It remains best-effort, with authenticated
  resend as the existing retry mechanism, not a durable email queue.
- Local memory limits and concurrency guards remain per-instance safeguards.
  Arcjet provides distributed rate limits across deployed instances.
- Registration allows 20 validation attempts per email/hour and 40 per IP/hour,
  with one submission per IP every two seconds. Validated account-creation work
  has separate limits of 10 per email/hour and 20 per IP/hour. Invalid inputs
  and breached passwords never consume the account-creation quota. The form
  validates short passwords locally and shows the server's Retry-After countdown.

References: [Services](https://vercel.com/docs/services),
[routing](https://vercel.com/docs/services/routing),
[configuration](https://vercel.com/docs/services/config-reference),
[Vercel function helpers](https://vercel.com/docs/functions/functions-api-reference/vercel-functions-package),
[request headers](https://vercel.com/docs/headers/request-headers),
[Neon serverless driver](https://neon.com/docs/serverless/serverless-driver).
