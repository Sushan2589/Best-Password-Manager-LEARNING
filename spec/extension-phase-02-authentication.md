# Phase 02: Authentication

Status: implemented. Phase 3 requires separate confirmation.

## Delivered behavior

- Existing-account login, password visibility, and immediate clearing of the submitted password input.
- Session detection on popup opening, revalidation on focus and every minute, and removal of account state at the server's session expiry time. Network and malformed-response failures fail closed.
- Verification-required screen, resend with cooldown, and status refresh after following the email link.
- Verified accounts reach a locked-vault screen. Vault access and decryption are deferred to Phase 3.
- Logout immediately removes the local profile, then requests server revocation. Failures remain visible with a retry button. Polling cannot restore the account after local logout during that popup's lifetime.

## Authentication transport and lifecycle

The popup sends validated messages to the background service worker. Only this extension's exact packaged popup URL may invoke authentication operations. The worker calls fixed API routes with credentials included, caching disabled, a timeout, and redirects disabled. Responses sent to the popup contain only approved profile fields or fixed error codes; salts, hashes, tokens, and arbitrary backend diagnostics are excluded.

The existing browser-managed session cookie remains HttpOnly and SameSite=Lax, with Secure enabled in production. There is no bearer-token fallback, cookie-reading permission, storage permission, or authentication database migration. Login is confirmed by an authenticated GET /user/me: a successful login POST alone is insufficient. Rejected cookies produce an explicit error and the popup stays signed out.

The worker caches no account, password, or token. Opening a popup or waking a stopped worker recovers authentication through the browser cookie and API. The sanitized profile lives in popup memory. No credentials or tokens are written to local/sync storage, IndexedDB, or application caches. JavaScript strings cannot be guaranteed to be physically zeroized; clearing references does not promise memory erasure.

Cookies for the same API host may be shared with the web app: login/logout through either client can affect the other. Cross-client logout is detected on the next focus/poll/request. If logout cannot reach the API, local state clears, but reopening the popup may recover the surviving cookie. Retry logout; network failures cannot guarantee remote revocation. If database revocation fails after the request reaches the API, the browser cookie still expires and the API reports failure.

Chrome documents special cookie behavior for extension requests with host permissions. Real HTTP cookie tests establish local compatibility; route mocks alone do not. Browser versions, enterprise policies, and site cookie restrictions require manual checks. See [Chrome cookie documentation](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies).

## Backend and manifest changes

- GET /user/me adds emailVerified and actual sessionExpiresAt, preserving existing web response fields.
- CORS uses exact configured web/extension origins. Mutating routes reject missing, null, and untrusted Origin headers independently of CORS. Session and verification middleware still authorize protected data. CLI mutation requests must now supply an allowed Origin.
- Responses use Cache-Control: no-store; uncaught failures return generic diagnostics. Logout expires its cookie before constructing the response, including database failures.
- Cookie options are shared across registration, login, and logout. Existing session hashes, Argon2 authentication, seven-day expiry, and database schema remain intact.
- Verification links use WEB_ORIGIN; Resend's returned errors are checked. Automated tests send no emails.
- A public manifest key fixes the unpacked development ID. It is public, not a signing secret or authentication credential. Origin checks supplement account authentication. Publishing requires the store identity and corresponding API allowlist updates.
- Removed an unused schema import exposed by the extension's stricter typecheck; no database definition changed.

## Upgrade and configuration

1. Restart the API for the new response fields and origin checks.
2. Run `npm run build:dev --workspace=extension` from the repository root.
3. Remove the old unpacked extension and load `apps/extension/dist` again. The development ID should be `aeklikmljjjbhgmhofhhmbimkmeajigp`.
4. Development defaults to API http://localhost:3001 and web http://localhost:3000. Update explicit environment overrides if your setup uses other origins.

Public API configuration is documented in apps/api/.env.example:

```dotenv
WEB_ORIGIN=http://localhost:3000
EXTENSION_ORIGINS=chrome-extension://aeklikmljjjbhgmhofhhmbimkmeajigp
```

Production requires NODE_ENV=production, an exact HTTPS WEB_ORIGIN, and explicit comma-separated EXTENSION_ORIGINS matching installed extension IDs. Production trusts no extension by default. Origins have no trailing slash, path, query, or wildcard. Build the extension with matching HTTPS VITE_API_ORIGIN. Database/Resend secrets stay on the API. HTTP is allowed only for loopback development.

## Validation

Run from the repository root:

```powershell
npm run build:dev --workspace=extension
npm run extension:test
npm run test:browser --workspace=extension
node node_modules/typescript/bin/tsc --project apps/api/tsconfig.json --noEmit
node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false
```

Tests cover actual Hono login/session/logout routes with mocked persistence, invalid/revoked/expired sessions, verification middleware, exact mutation origins, profile filtering, denied message senders, wrong passwords, rejected cookies, logout cleanup/retry, verification refresh, and expiry before the next poll.

Browser tests use isolated profiles. UI tests mock responses; cookie tests start a real loopback Hono fixture on a random port and build a separate packaged extension. They check HttpOnly/Lax cookies, authenticated requests, popup reopening, forced worker stop/restart through DevTools, logout removal, and third-party-cookie-blocking profile preferences. The worker's stopped and running states are asserted. No Neon or real account is used. Automated extension pages open as tabs; toolbar popup behavior remains a manual check.

Validation record (2026-10-11): all 70 unit tests and all 9 Chromium tests passed. Extension, API, and web typechecks passed. Development and production extension builds passed; production used a public example HTTPS API origin and a separate ignored output folder, preserving the local development bundle. The login screenshot was visually reviewed. The source scan found no extension console logging or persistent storage calls. `git diff --check` passed.

### Manual Chrome and Edge checks

1. Login with a verified account; close/reopen the toolbar popup. Authentication should recover with a locked vault.
2. Try a wrong password; its input clears and backend diagnostics stay hidden.
3. Use an unverified account, resend, follow the web verification link, and refresh status. Vault routes must still reject unverified accounts.
4. Stop the worker from the extensions page, close its inspector, and reopen the popup. Reload the extension and check again.
5. Repeat with third-party cookies blocked, then with cookies explicitly blocked for the API site. If unavailable, login must stay signed out with a cookie error.
6. Logout, reopen, and check the web app. Repeat while the API is unavailable: the local profile disappears and retry is available. Restore the API and retry before reopening.
7. Check web registration, login, verification, account edits, and vault CRUD from the configured web origin.

## Remaining scope

Manual Chrome/Edge, production HTTPS/Secure-cookie behavior, live Neon integration, and email delivery are not asserted by these local tests. Server-side login rate limiting and email-change verification need separate follow-up; popup cooldowns do not replace backend abuse controls. Cryptography and vault-key lifecycle remain Phase 3. Any future authentication fallback requires a reviewed proposal before implementation.
