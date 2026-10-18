# Arcjet API rate limiting

## Scope and architecture

Arcjet is integrated into the existing Hono/Node API using `@arcjet/node` 1.14.1.
The web app and MV3 extension need no Arcjet key, dependency or API changes.
Authentication, email verification, MFA, database schema, cookie behavior and
client-side vault encryption remain unchanged. No database migration is required.

This integration adds distributed sliding-window rate limits. It deliberately does
not forward original requests to Shield, bot detection or email validation. Those
features are not claimed as enabled; adding request inspection would require a
separate privacy/compatibility review for password, token and extension requests.
Existing CSRF checks, parameterized SQL, validation, security headers, local rate
limits and Argon2 concurrency limits remain essential.

Request order:

1. Security/no-store headers, CORS and trusted-Origin checks.
2. Existing local IP limits, then reserved/bounded request concurrency.
3. Arcjet IP limits, before consuming request bodies.
4. Existing bounded body/JSON parsing and local email limits.
5. Arcjet normalized email limits, before login/hash/mail work.
6. Session/email verification, then local + Arcjet authenticated-account limits on
   sensitive POST actions, before password/MFA verification or mutations.

Both layers select their limits from the same policy definitions. IP and account
budgets are independent, not combined; changing IP does not reset an account's
Arcjet budget. Account identities are normalized only for throttling, preserving
the existing login behavior. Successful admitted attempts still count.

| Scope | Maximum | Window |
| --- | ---: | --- |
| General IP | 600 | 1 minute |
| Login IP | 60 | 15 minutes |
| Normalized login email | 10 | 15 minutes |
| Registration IP | 5 | 1 hour |
| Normalized registration email | 3 | 1 hour |
| Verification IP | 20 | 15 minutes |
| Verification resend IP | 10 | 15 minutes |
| Normalized resend email | 3 | 15 minutes |
| Sensitive account actions IP | 60 | 15 minutes |
| Sensitive authenticated account | 10 | 15 minutes |
| Logout IP, independent budget | 60 | 15 minutes |

OPTIONS bypasses counters. Ordinary quota exhaustion does not consume the logout
quota. Local limits are checked first, so requests they already reject are not
reported/counted remotely. Sliding windows can be stricter than local fixed
windows at their boundaries; changing algorithms does not increase local budgets.

## Data minimization

The SDK receives a synthetic request with a constant `.invalid` host/path, empty
body/cookies/query, one constant Host header and a constant loopback placeholder IP.
It never receives the Hono request or request stream. The explicit `ipSrc` is that
constant placeholder; it is not copied from a client-controlled header.

Custom characteristics are **only** `securityScope` and `securityIdentity`.
`securityIdentity` is HMAC-SHA256 of the policy namespace and the real trusted
IP, normalized email, or authenticated user ID, keyed with
`ARCJET_IDENTITY_KEY`. The namespace separates otherwise identical policies.
The SDK uses those characteristics to fingerprint the rate-limit key. The same
site key, identity key and rule definitions must be used after restart and across
instances if shared budgets are intended. Arcjet still sees the API service's
outbound network address and timing/rate metadata. Keyed identifiers are pseudonymous
security data, not a claim of full anonymity.

No login/master password, MFA/recovery code, raw email/user ID/client IP, session
cookie, Authorization header, verification-token URL, saved website, decrypted
credential, encrypted vault payload or API request header is passed to Arcjet.
An explicit empty body prevents future SDK behavior from reading the real stream.
Remote/dashboard rules cannot access original request data through this adapter.
The privacy policy should disclose Arcjet's security processing and retention;
review the actual dashboard/site retention controls before launch.

SDK logging arguments and remote error messages are discarded. Logs contain only
bounded `arcjet_error`, `arcjet_blocked`, and `arcjet_would_block` event categories,
random event IDs and timestamps through the existing sanitized logger. SDK debug
settings do not cause request/decision objects or secrets to be logged.

## Decisions, errors and availability

- LIVE denial: generic `429`, `Cache-Control: no-store`, positive bounded
  seconds-valued `Retry-After`, exposed through the existing approved CORS policy.
- LIVE error: generic `503`, `Retry-After: 5`; no database/password/mail work follows.
  This includes SDK fail-open error decisions, rule errors, transport exceptions,
  unexpected conclusions, and unavailable real IP identities for IP quotas.
- Logout exception: on an Arcjet error, retain the independent local logout limit
  and reserved concurrency, then clear/revoke the session. A definite remote
  logout quota denial still returns `429`. Origin/session cleanup remains intact.
- DRY_RUN (non-production): observe SDK would-block/error events, retain all local
  limits, and continue. This does not bypass existing application checks.
- Cloud decision timeout is explicitly 500 ms per check. Multiple independent
  policies can require multiple checks per request (normally one for reads, three
  for login, up to four for sensitive POSTs). Account for that when monitoring
  latency, Arcjet plan usage and outages. The existing request/concurrency budgets
  bound concurrent waits.

Fail-closed decisions prioritize protection at the cost of API availability during
an Arcjet outage; this is intentional. Do not silently change to fail-open in
production. Repeated blocked/error events should feed deployment monitoring.

## Environment and production setup

Maintained example: `apps/api/.env.example`. Local actual `.env` files were not
read or edited. No key was generated, printed or uploaded by this change.

Use Node **22.21+ in the 22.x line**, or **24.5+** as accepted by the package engines.
The workstation had Node 22.14, so supported Node 22.23.3 was invoked temporarily
through `npx --package=node@22` for runtime tests. Upgrade the actual development
and deployment runtime; npm's EBADENGINE warning is not a successful compatibility
check. CI installs current Node 22 and verifies the supported range.

Set these only on the **API server**, not in web/extension builds:

```dotenv
NODE_ENV=production
ARCJET_MODE=LIVE
ARCJET_KEY=your-private-Arcjet-site-key
ARCJET_IDENTITY_KEY=your-private-random-64-hex-character-key
```

1. Create an Arcjet account/site and obtain its `ajkey_...` key. Use separate
   development/staging and production sites. Store the real key in the deployment's
   private secret manager, never source control, screenshots or chat.
2. Generate a distinct identity key locally:

   ```powershell
   node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
   ```

   Store it privately as `ARCJET_IDENTITY_KEY`. Keep it stable. Rotating it changes
   rate-limit identities and starts fresh remote quotas. Never reuse the MFA key.
3. For local development, `ARCJET_MODE=OFF` needs neither key. To observe remote
   behavior use `DRY_RUN` and both keys; use LIVE in staging to verify actual denials.
   Production defaults to LIVE and refuses startup with OFF/DRY_RUN, missing keys,
   malformed values or `ARCJET_ENV=development`. Copying the development example
   unchanged into production will intentionally fail startup.
4. Allow outbound HTTPS to Arcjet's documented decision endpoint. Do not point the
   SDK at an untrusted `ARCJET_BASE_URL`. No frontend CSP or new incoming origin
   permission is needed for the server-side integration.
5. Set the existing HTTPS `WEB_ORIGIN`, exact store/development `EXTENSION_ORIGINS`,
   secure cookies, Resend sender and MFA/revocation settings as documented elsewhere.
6. Review the actual reverse proxy topology. `TRUSTED_PROXY_IPS` remains empty by
   default. Only an exact allowlisted immediate peer may provide a single validated
   `X-Forwarded-For` address; the proxy must overwrite the header. Untrusted chains,
   `X-Arcjet-IP`, `Forwarded`, and provider-specific IP headers do not become trusted
   through the SDK, because the real request never reaches its IP resolver. Protect
   the origin from bypass of the intended proxy. A wrong proxy configuration can
   group all users into one quota; verify this in staging.
7. Restart the API, exercise ordinary web/extension login and vault operations,
   inspect the Arcjet dashboard and perform the staging checks below.

## Deployment limits that Arcjet does not solve

Keep one API instance with a private persistent `SECURITY_STATE_DIR` until durable
session-revocation retry state is shared safely. Arcjet adds shared rate counters;
it does not replicate that revocation barrier. Local counters/concurrency still
reset on restart, and upstream connection/request/DDoS controls are still needed.
NAT sharing, IPv6 rotation and deliberate account-quota exhaustion remain tradeoffs.
This integration is not a production security certification or independent audit.

## Verification

With a supported Node runtime:

```powershell
npm run test --workspace=api
npm run typecheck --workspace=api
npm audit --audit-level=moderate
```

Automated tests use no live Arcjet key, database or email. The SDK tests run the
actual installed SDK and its fingerprint/rule construction, mocking only the cloud
client boundary. Request integration tests exercise production Hono middleware with
fixture persistence. Coverage includes production config refusal; stable keyed
identities across clients/restarts; separated scopes/accounts; actual sliding-window
configuration; empty synthetic request body/headers; IP validation/spoof resistance;
normalized email budgets before authentication; denials and Retry-After/security/CORS
headers; SDK/partial-rule failures; logout outage behavior and quota isolation;
OPTIONS/CSRF; malformed/oversized bodies; authenticated reauthentication budgets;
DRY_RUN and sanitized logging. Existing security/password/database tests also run.

Staging with a dedicated test account/site, never real passwords:

1. Verify web and unpacked/store extension sign-in, email restrictions, MFA, vault
   read/write, separate password changes and logout against the real HTTPS API.
2. Submit 11 admitted login requests for the same sample email within 15 minutes;
   expect a generic `429` and positive `Retry-After`. Local limits may reject first.
   To specifically verify shared cloud counters, use separate test processes with
   the same site/identity keys and split attempts between them. Use disposable
   fixtures; this is a test setup, not authorization to replicate production's
   unshared revocation storage. Restarting a test process must not reset the cloud
   budget. Confirm corresponding decisions in the dashboard.
3. Changing a spoofed forwarding header from an untrusted peer must not change the
   IP quota. A configured proxy must yield the intended validated client identity.
4. In isolated staging, deny outbound Arcjet traffic: ordinary requests should
   return `503`, sensitive operations must not run, and logout should still clear
   the session through its local protection. Restore connectivity and retest.
5. Verify no raw emails, request tokens/cookies, vault data or credentials appear
   in the Arcjet dashboard or API logs. Account hashes should be stable and distinct.

Live cloud connectivity, real proxy topology, dashboard retention and production
configuration require those deployment checks; local tests do not assert them.

Validation completed on 2026-10-18: all **84 API tests** passed (including 18 new
Arcjet configuration/SDK/request tests), API TypeScript passed using Node 22.23.3,
and `npm audit --audit-level=moderate` reported **0 vulnerabilities**. No live
Arcjet account/key, Neon database, email delivery or deployment was used.

## Sources

- [Arcjet Node SDK configuration and errors](https://docs.arcjet.com/reference/nodejs)
- [Rate-limit configuration](https://docs.arcjet.com/rate-limiting/configuration)
- [Fingerprint characteristics](https://docs.arcjet.com/fingerprints)
- [Arcjet privacy](https://docs.arcjet.com/privacy)
