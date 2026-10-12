# Password manager security assessment — 2026-10-12

> Historical assessment before the subsequent remediation. For current fixes, validation, migration and remaining deployment requirements, read [the remediation report](security-remediation-2026-10-12.md). Open findings and reproduction results below describe the earlier snapshot.

## Verdict

The application has useful defenses and the tested attacks below were blocked where indicated. **This is not a clean production security sign-off.** Two high-priority application findings remain reproducible: changing email preserves verification, and the web vault accepts an unchecked derived key. Registration still permits six-character passwords. Basic throttling is implemented, but multi-instance deployment needs shared limits and infrastructure controls. Five high-severity development dependency findings remain.

The review hardened rate limiting, payload validation, error handling and response headers, patched compatible dependencies, and removed external vault favicon lookups. It did not redesign authentication, encryption, account recovery or the database.

## Scope and method

Reviewed Hono route/middleware/session code, Drizzle predicates/schema, Next.js vault/account/auth views, shared Argon2id/AES-GCM utilities, extension trust/storage boundaries, dependency lockfile, logging call sites and tracked secret patterns.

Active probes ran against in-process Hono applications and an ephemeral loopback HTTP listener. Persistence and email were mocked; no Neon database was queried or changed and no real verification email was sent. Production Next.js pages were tested in an isolated Chromium context with locally encrypted fixture credentials and intercepted API responses. Extension browser checks used isolated test profiles and fixture services. Payloads were local HTML/SVG strings, invalid/oversized JSON, injection-like IDs, forged/expired cookies and bounded authentication bursts.

No third-party website, public production deployment, real user's vault or live credential was attacked. TLS termination, actual reverse-proxy configuration, production logs, deployment secrets, database roles/backups and Git history were not audited. No large denial-of-service load, dependency RCE payload or exhaustive fuzzing was performed. npm audit establishes advisory matches, not exploitability in this application's reachable routes.

Some tests deliberately assert an existing flaw to preserve reproducibility. A passing test count therefore includes **finding reproductions**, not only working security controls.

## Findings and remediation status

| ID | Severity | Finding | Status |
| --- | --- | --- | --- |
| SEC-01 | High | No general login/registration/verification throttling | Basic per-IP/account limits fixed; distributed protection remains open |
| SEC-02 | High | Email change retains `emailVerified=true`, without reauthentication | Confirmed open |
| SEC-03 | High, availability/integrity | Web unlock accepts a key without proving the vault password | Confirmed open |
| SEC-04 | High | Registration accepts six-character passwords; no MFA or breached-password check | Open |
| SEC-05 | High/critical advisories | Vulnerable production/framework and tool dependencies | Compatible patches applied; five high dev-chain entries remain |
| SEC-06 | Medium | Weak API input bounds, arbitrary nonce/ciphertext strings and malformed JSON handling | Hardened |
| SEC-07 | Medium | Web/API lack basic defensive headers | Baseline fixed; strong script CSP remains open |
| SEC-08 | Medium privacy | Web vault sends saved website domains to a third-party favicon service | Fixed |
| SEC-09 | Medium | Public auth responses/timing permit account enumeration | Open, constrained by new limits |
| SEC-10 | Medium | Verification tokens not atomically consumed or bound to a specific email address | Source-review finding; open |
| SEC-11 | Medium deployment | In-memory throttling, absent shared abuse/concurrency controls | Documented baseline limitation; open for production |
| SEC-12 | Low/medium | No structured security monitoring/session-management UI; broad seven-day server session | Open operational improvements |

Severity is review judgment about impact and prerequisites, not a calculated CVSS rating. Advisory severities belong to upstream packages, not automatically to every application route.

## Rate limiting and brute-force protection

Implemented independent IP and normalized-email budgets, with fixed windows, bounded memory, HMAC-only stored identities, safe proxy handling, generic `429` responses and `Retry-After`. IP checks precede body parsing; account checks precede expensive authentication work. Limits, exemptions, proxy requirements and tradeoffs are in [the rate-limit specification](security-rate-limiting.md).

Attack results: ten concurrent bad-password attempts reached verification, the eleventh was blocked; rotating spoofed forwarding headers did not bypass IP budgets; spraying sixty accounts exhausted the independent login-IP budget; rotating IPs still hit the account quota; store saturation could not evict a blocked victim; advancing the clock past expiry restored access. Verification/registration budgets engaged. Logout remained available after exhausting the general quota. The loopback test exercised actual Node connection metadata and HTTP requests, not just a mock IP function.

This does not stop distributed attacks against many accounts, leaked valid credentials or offline vault guessing. Existing login hashes use Argon2id; the installed library defaults are 64 MiB memory and three iterations. Client vault derivation also uses Argon2id at 64 MiB/three iterations. Expensive hashing makes strong, unique passwords important; it does not compensate for six-character choices. Raise **new-registration** password policy while preserving existing login compatibility, then add breached-password screening and MFA/passkeys. Avoid permanent lockouts that attackers can trigger against victims.

## Authentication and verified-email changes — SEC-02/04/09/10

`apps/api/routes/user.ts` accepts an authenticated PATCH to `/user/me` with a different email. It updates the address but does not reset verification, require the account password, confirm the new address or invalidate old verification tokens. The Hono reproduction returned `200` and captured an update containing only the new email. A previously verified row therefore retains its verified flag for an unverified address. **Full account takeover was not demonstrated**; this is a confirmed verification/trust bypass.

Recommended fix: require current-password/recent authentication, store a pending address, bind a short-lived token to that address, consume it and change the address atomically, invalidate conflicting old tokens, and notify the old address. Until that flow exists, disabling email changes is safer than claiming they are verified. This requires coordinated backend/UI work; it was not silently changed during this assessment.

Login returns the same `401` text for missing users and incorrect passwords, which avoids direct message enumeration. However, a missing user skips Argon2 verification, so timing can differ. Registration returns a distinguishable duplicate-email `409`; resend distinguishes missing, verified and unverified accounts. The timing risk is based on code review, not a statistically controlled production timing experiment. Add uniform responses and comparable authentication work, without enabling mail abuse or leaking operational details.

Verification tokens are random 32-byte values hashed before storage and expire after 30 minutes. The new API validates exact 64-character hexadecimal input and limits guesses. Consumption currently performs a separate lookup, user update and token deletion. Concurrent uses can race, and the token is bound to user ID rather than the email address it verifies. Implement atomic consumption/address binding with the email-change fix. This race was identified in source; no live database replay attack was run.

## Web vault unlock — SEC-03

`apps/web/src/lib/crypto/unlockVault.ts` fetches the salt, derives a key, stores it and returns true. It does not authenticate that key against existing ciphertext. The web UI separately fails to decrypt entries but leaves its dashboard unlocked and **Add Credential** enabled.

Both a function-level reproduction and the production Chromium probe confirmed this behavior with a wrong fixture password. Existing ciphertext still refuses authenticated decryption: this is **not** a way to read somebody else's vault without the correct password. It is an integrity/availability risk because new entries can be encrypted with a mistyped key and mixed into a vault that the correct password later cannot fully decrypt.

Fix populated-vault unlock by decrypting/validating existing entries before accepting the key, as the extension already does; clear the key and disable writes on failure. Empty vaults need an explicit setup/confirmation flow or encrypted password verifier. Add cancellation/account-switch protections and compatibility vectors. No KDF or ciphertext-format change is required merely to validate a populated vault; an empty-vault verifier needs a deliberate compatible design.

## XSS and client-side secrets

The production browser probe encrypted `<img ... onerror=...>` and `<svg ... onload=...>` strings into fixture credentials, unlocked them through the real web crypto/UI, and verified literal text rendering, no injected nodes and no script marker execution. Extension credential browser checks include malicious notes and unsafe website addresses. Source inspection found no application `dangerouslySetInnerHTML` or `eval` sink in the reviewed web/auth/vault paths. Generic form detection reads page structure; it does not inject credentials through page attributes or `window.postMessage`.

This is targeted stored-XSS evidence, not proof of all DOM, reflected or supply-chain paths. JavaScript executing within the trusted web app while unlocked can read in-memory credentials and use the session. Client-side encryption does not defeat trusted-origin XSS or a malicious application update.

Removed `VaultCard`'s external Google favicon requests, replacing them with local initial badges. A browser test asserts no external requests while rendering the fixture vault. Previously the favicon URL disclosed saved website hostnames even though passwords remained encrypted. The browser clipboard and already-filled website inputs remain outside the vault's control after copying/filling; locking cannot retract those values.

## CSRF and CORS

Every unsafe API method requires an exact approved Origin through the existing middleware. Missing Origin, literal `null`, attacker origins and lookalike suffixes returned `403` before database access. Unapproved GET origins did not receive `Access-Control-Allow-Origin`; allowed credentialed callers retain their existing behavior. JSON mutations now require `application/json`; plaintext/simple-content requests with an otherwise trusted Origin return `415`. Production sessions use `SameSite=Lax` in addition to Origin validation.

Origin is a browser CSRF defense, not authentication: bots can send an allowed header and still need the session cookie for protected endpoints. Same-origin XSS also bypasses CSRF defenses. Keep exact origin configuration; do not replace it with wildcards or suffix matching. Logout's rate-limit exemption does not exempt it from Origin validation.

## SQL injection and access control

Reviewed queries use Drizzle `eq`/`and` predicates rather than raw SQL string concatenation. Read/update/delete item predicates bind both item ID and authenticated user ID; update concurrency guards also bind previous ciphertext when supplied. Probe tests compile the actual ORM update predicate and verify owner identity appears as a bound parameter, not interpolated SQL text. Injection-shaped item IDs are now rejected by UUID validation; plaintext/invalid-format vault writes are rejected before insertion.

These tests validate application query construction and route rejection. They do **not** constitute an actual PostgreSQL execution/role audit or independently prove every database authorization scenario. A stolen authenticated session can still read/modify that user's encrypted records, although it does not itself reveal the vault key. Review Neon database permissions, row isolation, backups and restore controls separately.

## Session security

The actual session service was exercised with mocked insertion: two generated tokens were different, 43-character Base64url values representing 256 bits of randomness; only SHA-256 hashes were inserted; expiry exceeded six days and is configured for seven. Invalid and expired cookies returned `401`. Login issued an HttpOnly/Lax cookie and never returned a raw token or password hash in JSON. Production configuration sets Secure; cookies are host-only because no Domain is set. Oversized cookie tokens are rejected before lookup.

Existing real-browser fixture checks passed for HttpOnly cookie authorization, logout clearing and third-party-cookie blocking behavior with extension host access. Database revocation failures still expire the client cookie and report failure; a previously stolen token can remain server-valid when revocation fails. Retry/alert handling matters. Session management should eventually support user-visible device revocation, sensitive-action reauthentication, server-side idle limits and a shorter configurable absolute lifetime. Extension keys remain in memory with bounded lock policies, not persistent browser storage.

## Input validation and error handling

New limits count actual body bytes even with a misleading Content-Length: 16 KiB for non-vault requests, 3 MiB for vault requests. The latter accommodates new and expected ciphertext in conditional updates. Oversized requests return `413`; malformed JSON returns `400`; invalid content type returns `415`. Login/registration passwords are bounded at 1,024 characters and emails at 254. Verify/resend now use typed schemas; arrays, null and object-shaped email attacks are rejected. Profile inputs are type/bounds checked. Vault nonce must encode 12 bytes, ciphertext is bounded Base64, and item IDs must be UUIDs.

Format validation does not let the server verify encrypted credential plaintext or AES authenticity: that stays client-side. Existing malformed stored records are not migrated or repaired; they can still cause unlock failures. No raw database exception, password, cookie or injected private diagnostic appeared in tested error responses/log calls. Error logs remain fixed category messages. Request/concurrency/read-timeout limits at the proxy are still necessary; bounded JSON bodies alone do not prevent slow clients or distributed overload.

## Headers, dependencies, secrets and logging

API responses now have no-store and Hono secure-header middleware, DENY framing, no-referrer, nosniff and production HSTS. The web app disables X-Powered-By and adds equivalent framing/referrer/nosniff headers, a restrictive Permissions-Policy and production HSTS. Its baseline CSP blocks frames, objects, external base URLs and non-self form destinations. **It does not constrain script-src**. A nonce-based script CSP remains recommended; Next.js hydration/rendering requirements must be tested rather than adding unsafe blanket script allowances.

The first npm audit reported **10 entries: 3 critical, 7 high**. Compatible updates changed Next.js and eslint-config-next from 16.3.4 to 16.3.8 and refreshed locked transitive dependencies, including sharp 0.35.5 and shell-quote 1.12.0. Final audit reports **0 production advisories** with `--omit=dev`, and **5 high entries** in the braces → micromatch → fast-glob → Next ESLint chain in the full tree. These are propagated package entries, not five separate confirmed application exploits. npm's remaining recommendation downgrades eslint-config-next to 14.2.35; no forced incompatible downgrade was applied. Keep lint/build inputs controlled and monitor upstream fixes. Audit data is date-specific.

No `next/og`/ImageResponse route accepting untrusted SVG was found, so the original critical Next advisory was not reproduced here. Patch maintenance is still appropriate. The patch upgrade exposed the verification page's missing Suspense boundary; it was added, and production build now passes. Raw audit artifacts are linked below.

A pattern scan of the 191 originally tracked files, excluding dependencies, found no matching private-key blocks, AWS access keys, literal credentialed PostgreSQL URLs or Resend-key patterns. This is limited evidence, not a full secret audit. Local `.env` values were not printed or copied; Git history, hosting environment and external logs were not scanned. Server database/mail credentials must remain in server-only environment/secret storage. Public API origins and the extension manifest's public identity key are not private credentials.

Current application error logs use fixed messages. Keep bodies, Cookie/Authorization headers, verification URL query tokens, plaintext entries, passwords, vault keys and raw driver errors out of observability. Add bounded structured security events, request IDs and alerts for repeated failures/revocation problems; avoid unrestricted per-request attack logs that amplify a flood.

## Validation and repeatable commands

- API suite: **28 tests passed**, including real loopback HTTP, cryptographic session generation, rate limits, CSRF/CORS, malformed/oversized inputs, session rejection, SQL predicates, sanitized diagnostics and email-change finding reproduction.
- Extension/shared suite: **287 tests passed**, including crypto compatibility/authentication, extension trust boundaries and the web-unlock finding reproduction.
- Extension browser subset: **8 passed** for cookie and credential safety behavior.
- Production web probe passed headers, rate-limit UI feedback, encrypted stored-XSS text rendering, no external favicon requests/password logs; it also reproduced the wrong-password write-state finding.
- API and extension TypeScript checks, production web build (including TypeScript), extension development build and diff whitespace checks passed.

```powershell
npm ci
npm run test --workspace=api
npm run typecheck --workspace=api
npm run test --workspace=extension
npm run build --workspace=web
npm exec --workspace=extension -- playwright install chromium
npm run test:security --workspace=web
npm run build:dev --workspace=extension
npm run test:browser --workspace=extension -- credentials.spec.ts cookies.spec.ts
npm audit
npm audit --omit=dev
```

The web browser script launches and terminates its own ephemeral production server and intercepts API responses. It never starts the real database API. Build before running it. Test fixtures contain public sample credentials, not user secrets. Restart the API and web app to apply deployed middleware/header changes. No database migration is required for changes made in this review. Production must set an HTTPS `NEXT_PUBLIC_API_URL`, exact HTTPS `WEB_ORIGIN`, explicit trusted extension origins where enabled, and `NODE_ENV=production`; configure TLS at the reverse proxy and protect direct backend access. Do not deploy the development servers or assume localhost defaults are production configuration.

## Priority work before production

1. Fix verified-email changes and atomic verification-token consumption/address binding.
2. Validate web vault keys before accepting them; design safe empty-vault setup and disable writes on failed decrypt/account expiry.
3. Raise new-registration password strength, add MFA/passkeys and generic enumeration-resistant responses/work.
4. Deploy atomic shared throttling and upstream connection/concurrency/body/read-timeout controls; verify trusted proxy and TLS behavior in that deployment.
5. Add a tested script CSP, security monitoring, reliable revocation handling/session controls and continuous dependency/secret-history scanning.

## Artifacts and primary references

- [Audit before changes](security/npm-audit-before-2026-10-12.json), [full audit after changes](security/npm-audit-after-2026-10-12.json), [production audit after changes](security/npm-audit-production-2026-10-12.json).
- [API security probes](../apps/api/tests/security.test.ts), [web browser probes](../apps/web/tests/security-browser.mjs), [current web unlock regression tests](../apps/extension/tests/unit/web-vault-security.test.ts).
- [OWASP authentication/throttling](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html), [Hono secure headers](https://hono.dev/docs/middleware/builtin/secure-headers), [Next.js CSP guide](https://nextjs.org/docs/app/guides/content-security-policy).
- [Next ImageResponse advisory](https://github.com/advisories/GHSA-vcvr-r3jv-pc5j), [shell-quote advisory](https://github.com/advisories/GHSA-pqg4-j6r4-53mv), [remaining braces advisory](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm).
