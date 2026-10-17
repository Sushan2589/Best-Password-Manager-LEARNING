# Security remediation — 2026-10-12

**Favicon update (2026-10-17):** automatic website icons were restored at the user's request, without a toggle. Google receives requested website hostnames and the browser IP; hostname-only requests and local fallbacks limit exposure but do not eliminate this privacy tradeoff. This supersedes the SEC-08 no-external-favicon behavior below. See [current favicon specification](website-favicons-privacy-2026-10-17.md).


This is the current implementation report. [The original assessment](security-report-2026-10-12.md) is retained as historical evidence, including findings that have now been fixed. Changes preserve Hono, database-backed cookie sessions, Argon2id, and the existing AES-256-GCM credential format.

## Deployment status

The code and local fixture tests are complete. **The Neon migration has not been applied, and these changes have not been deployed.** Apply the migration before starting the updated API against an existing database. Live email delivery, production TLS/proxy settings, backups, infrastructure limits and alerting still require deployment validation.

Arcjet is deliberately deferred according to the owner's development plan. No Redis service was assumed or added. Until a shared enforcement design exists, deploy only one API instance with persistent private security-state storage. Arcjet's future abuse protection will not automatically provide shared session-revocation storage.

## Findings mapped to fixes

| Finding | Implementation | Remaining qualification |
| --- | --- | --- |
| SEC-01, brute force | Separate IP/account budgets, authenticated reauthentication budget, bounded Argon2 concurrency | Local counters reset on restart; Arcjet/edge protection deferred |
| SEC-02, verified email changes | Old PATCH cannot change email; current password plus enabled MFA required; pending address stays inactive until its own confirmation | Requires migration and working mail configuration |
| SEC-03, unchecked vault key | Validate every encrypted entry before publishing key; confirmed empty-vault setup writes an encrypted owner-bound verifier | Legacy populated vaults work unchanged; empty legacy vaults require setup in web app |
| SEC-04, weak passwords | New registration requires 15 Unicode characters, checks breached passwords; optional TOTP MFA and single-use recovery codes | Existing login passwords remain compatible; users must opt into MFA |
| SEC-05, dependencies | Framework patches and direct lint plugins remove vulnerable Next lint dependency chain; Zod patch fixes packaged CommonJS locale failure | npm audit is advisory evidence, not a supply-chain security guarantee |
| SEC-06, input validation | Bounded streaming JSON, content type checks, bounded ciphertext/nonce/UUID/profile inputs, parsed decrypted entries | The server cannot validate encrypted plaintext without the vault key |
| SEC-07, headers/XSS | Per-response nonce CSP, restricted script execution, framing/referrer/no-cache headers | Trusted app script compromise can still access an unlocked vault |
| SEC-08, favicon privacy | Local initial badges replace third-party favicon calls | Clipboard and already-filled page inputs remain outside vault control |
| SEC-09, enumeration | Generic registration responses, dummy Argon2 verification for unknown users, authenticated resend, bounded asynchronous registration email delivery | Not a claim of perfectly constant network/database timing |
| SEC-10, token replay/binding | One atomic PostgreSQL statement locks owner, consumes address-bound token, changes address and revokes sessions | Local PostgreSQL tests are not a multi-host Neon stress test |
| SEC-11, availability | Request/headers/keep-alive timeouts, 16 ordinary request slots, two reserved logout slots, two password-hash slots | Distributed DDoS/slow-client edge enforcement deferred |
| SEC-12, sessions/monitoring | 24-hour absolute and 30-minute request-idle sessions, session UI/revocation, revocation versions, durable failed-logout barrier, bounded structured events | Production monitoring, persistent volume and replicated revocation design remain operational work |

## Account and verification behavior

`PATCH /user/me` updates the display name. A different email returns `409`; it cannot silently inherit verification. The account page's security section uses `POST /security/email-change`, requiring the existing account password and an enabled authenticator/recovery factor, unless the session has a server-recorded MFA proof from the preceding five minutes. The candidate address is stored as `pending_email`.

Confirmation tokens contain 256 random bits, are stored only as hashes, expire in 30 minutes and include the specific target address and purpose. Confirmation atomically consumes the live token, changes only the currently pending address, increments the account session version and deletes sessions. A superseded or replayed link is rejected. Notifications go to the old address when requesting a change. New verification links place the token in the URL fragment; the verification page captures and removes it from the address bar before submitting the POST. Legacy query links still work where their database tokens remain valid.

Registration returns the same `202` response for an existing address and a newly created account, and never automatically creates a session. Registration delivery is bounded to two in-flight best-effort mail operations and does not delay the public response. A delivery failure/restart may require signing in and using authenticated verification resend. Resend cannot target somebody else's account, and only replaces tokens with purpose `verify`. Existing sessions, name edits and unverified sign-in remain supported.

## Password policy and MFA

New account passwords require at least 15 Unicode code points, at most 1,024 UTF-16 code units, without mandatory composition rules. Login accepts legacy passwords. The API checks new passwords using the padded Pwned Passwords range protocol: only the first five hexadecimal characters of a SHA-1 digest are transmitted; matching occurs locally. SHA-1 here is a lookup identifier, not the stored password hash. Stored login passwords still use Argon2id. Network errors, malformed responses and responses over 1 MiB fail registration closed with a generic temporary-unavailable response. The request has a five-second timeout. [Protocol documentation](https://haveibeenpwned.com/API/v3#SearchingPwnedPasswordsByRange).

MFA uses standard six-digit SHA-1 TOTP with 30-second steps and a one-step clock allowance. Setup requires the current password, expires in ten minutes, and cannot overwrite an enabled factor. The user enters the setup key manually into an authenticator, confirms a valid code, and receives eight recovery codes once. Each recovery code has 128 random bits and is stored only as a SHA-256 hash. The secret is encrypted using the shared AES-GCM utility and a server-only encryption key, with the account identity inside the authenticated plaintext.

OTP steps are atomically consumed and cannot be reused. Recovery codes are atomically deleted on use. Enabling/disabling MFA revokes all sessions and increments the session version, preventing concurrent logins from restoring an older authentication state. A login after these changes can only use a current account version. Both web and extension sign-in accept an authenticator/recovery code. MFA removal requires the password and factor or recent server-recorded MFA proof. After enrollment, save recovery codes offline and sign in again with a fresh code. [TOTP standard](https://www.rfc-editor.org/rfc/rfc6238).

`MFA_ENCRYPTION_KEY` is a 32-byte random server-only key encoded as 64 hex characters. A local key was provisioned in the ignored API `.env` without printing its value. Each deployment needs its own securely provisioned and backed-up value. Never put it in `NEXT_PUBLIC_*`, extension settings, Git, logs or a container image. Replacing it without re-encrypting existing MFA records breaks their authentication. There is no insecure MFA reset endpoint bypassing the factor.

## Vault lifecycle

The web key store keeps a non-extractable key in memory with an account owner, cancellation generation and a fixed 15-minute unlock deadline capped by session expiry. Lock removes references, notifies views, clears credential/reveal state and redirects edit/create screens out of the decrypted form. Refresh/page hiding clears the list's key; normal SPA navigation remains usable. New/edit writes recheck the verified session and key owner, send `X-Vault-Account`, and reject a key cleared during encryption. Delayed unlock/decrypt results cannot restore an explicitly locked vault.

Unlock parses owner-bound encrypted rows and validates all decrypted entries against the existing schema. Existing populated vaults need no re-encryption. An empty, uninitialized vault requires a matching confirmation and a 15-character master password; the client sends only an encrypted verifier to `POST /vault/setup`. That endpoint can initialize the verifier only once and only while the vault is empty. The extension can unlock an empty initialized vault using that same verifier; it cannot silently choose a password for an empty legacy vault.

These changes add an authenticated known plaintext marker but do not change Argon2 parameters, salt interpretation, ciphertext structure or AES-GCM nonces. Possession of ciphertext/verifier permits offline password guesses, as existing authenticated ciphertext already does. Strong distinct vault passwords matter. Existing login authentication still sends the account password over HTTPS to the API; using that same password for the vault gives a compromised authentication server an opportunity to derive the vault key. This remediation does not claim to replace the existing authentication protocol with a server-blind master-password proof. A migration to such a protocol requires a separate deliberate design.

Browser memory is not securely erasable JavaScript storage; removing references is the available cleanup mechanism. Lock cannot retract clipboard contents or values previously filled into a website. Extension timed/popup-close policies, isolated chooser UI, user-initiated filling, document/origin checks and encrypted save drafts remain intact.

## Sessions and reliable logout

New sessions expire after 24 hours, and requests after 30 minutes without authorized API activity are rejected. Session polling counts as API activity, so this is request-idle expiration, not physical user inactivity. Database rows contain only hashed random session tokens; cookies remain HttpOnly, production Secure and SameSite Lax. The account page lists nonsecret session metadata and supports password/factor-confirmed, owner-bound revocation.

Logout clears the response cookie and records the token hash in a private durable retry barrier before database deletion. If the database fails, the same API instance denies that cookie and retries deletion every minute without overlapping retry loops. A restart reloads the barrier. No raw cookie or plaintext credential is persisted. Ordinary rate-limit exhaustion does not consume the separate logout quota: logout has its own 60-per-IP/15-minute budget and two reserved concurrency slots.

Configure `SECURITY_STATE_DIR` on a private persistent writable volume owned by the API process. Unix creation modes are restrictive; configure equivalent ACLs on Windows. The directory must not be publicly served, backed up into source control, or shared by independent writers. Corrupt/unavailable state fails closed. The 4,096-hash overflow condition deliberately denies all sessions rather than admitting uncertain revocations. Operator recovery: stop the API, invalidate database sessions, repair private storage, then reset the barrier and restart. Never clear a failed-revocation barrier while its sessions may remain valid. Multiple replicas require shared durable revocation state; future Arcjet alone does not solve this.

Structured events contain only a fixed category, random event ID and timestamp, limited to ten emitted events per category per minute. Bodies, emails, IPs, passwords, tokens, keys, credential plaintext and raw driver errors are excluded. Production log collection/alerts are not provisioned by repository changes.

## XSS, CSRF, SQL and headers

Unsafe API requests retain exact trusted-origin checks, approved credentialed CORS and JSON content requirements. The server never trusts an arbitrary forwarding chain; only a configured immediate proxy with a single overwritten valid IP can supply forwarding identity. Parameterized Drizzle predicates bind values and owner IDs. New token/MFA operations use atomic, parameterized statements compatible with the existing Neon HTTP driver rather than unsupported callback transactions.

Next.js now generates a random nonce for each response, sets it on the request and response CSP, and uses dynamic rendering so hydration receives the same nonce. Production script policy has no JavaScript `unsafe-eval` or script `unsafe-inline`; `wasm-unsafe-eval` supports packaged Argon2 WASM. Inline style attributes remain allowed for React layout, while stylesheet sources are restricted. Development keeps the allowances needed for development tooling. Dynamic rendering/no-store is an intentional performance tradeoff. [Next.js nonce guidance](https://nextjs.org/docs/app/guides/content-security-policy).

The production browser test injects a script into the delivered HTML and verifies nonce enforcement, rather than using privileged debugger evaluation as an attack. Encrypted HTML/SVG fixture credentials render as text, make no external favicon requests and produce no password logs. Neither targeted tests nor CSP make every possible supply-chain/XSS attack impossible.

## Migration and rollout

**Do not substitute `npx drizzle-kit push` for this data migration.** On an existing database, push attempts `ADD COLUMN target_email text NOT NULL` while old verification-token rows have no target address, causing `contains null values`. Run the complete SQL file below first, including after a partially completed push. Its `IF NOT EXISTS` clauses tolerate already-added columns/tables. It first adds the target column as nullable, removes legacy unbound tokens, then enforces `NOT NULL`. No placeholder address or unverified backfill should be used. After executing the file, `push` may be used to check remaining schema differences; review any proposed destructive changes.

1. Back up the database and server secrets. Stop old API writers during migration/rollout; test against a staging database first.
2. Execute [20261012_security.sql](../apps/api/migrations/20261012_security.sql) in the Neon SQL editor or your trusted migration runner. It adds verifier, pending-email, session-version/activity, token-target and MFA tables/columns in a transaction. Legacy unbound verification tokens are deliberately removed; users must resend those links. Existing account rows and encrypted vault items remain intact. Existing session expiry is capped at 24 hours. Keep the database timezone UTC for the existing timestamp-without-timezone schema.
3. Provision `MFA_ENCRYPTION_KEY`, `SECURITY_STATE_DIR`, server-only database/mail secrets, exact HTTPS `WEB_ORIGIN`, explicit trusted extension origins, and `NODE_ENV=production`. Configure the production HTTPS API URL in web and extension builds. Put the API behind correctly configured TLS/proxy limits and protect direct access.
4. Install the lockfile dependencies and deploy API/web together. Reload/rebuild the extension so its MFA and empty-verifier support is present. Clear or revoke old sessions if coordinating a security release; do not change vault salts or re-encrypt old credentials.
5. Verify real registration mail, authenticated resend, new-address confirmation, MFA enrollment/recovery, session revocation and API restart behavior in staging. The fixture tests intentionally do not send real mail or query Neon.
6. Add Arcjet during the planned development phase, configure/test it against the actual proxy topology, then choose a shared revocation strategy before replication. Configure monitoring and recovery procedures.

## Validation evidence and repeatable checks

- API: **43 tests pass**, covering bounded HTTP/CSRF/input/auth attacks, actual PostgreSQL migration/token/MFA/session predicates, prefix-only breach checks, response failure cases and durable restart revocation.
- Extension/shared/web lifecycle: **293 unit tests pass**, including frozen Argon2/AES compatibility, empty verifier ownership, MFA messaging and failed/cancelled web unlock.
- Extension Chromium: **62 browser tests pass**, including cookies, worker/offscreen lifecycle, autofill/navigation races, phishing origins, forms/shadow widgets, save/update confirmation and origin approvals.
- Production Next.js browser probe: headers/nonces, rejected injected script, stored-XSS text rendering, no favicon/password leaks, rate-limit feedback, wrong-password lock state, pending-email UI reauthentication cleanup and fragment-token verification pass.
- API/extension TypeScript, production web build and web ESLint pass. CI repeats these checks and npm advisory checks; Dependabot requests updates rather than automatically deploying them.
- Full and production npm audit snapshots contain **zero advisories**: [full](security/npm-audit-remediation-2026-10-12.json), [production](security/npm-audit-production-remediation-2026-10-12.json).
- Local Git-history pattern scan covered **19 commits and 324 distinct nondependency blobs**, with no matching private-key blocks, AWS access keys, literal credentialed PostgreSQL URLs or Resend key patterns. This limited pattern scan is not a complete secret inventory; production secret stores and external logs were not inspected.

```powershell
npm ci
npm run test --workspace=api
npm run typecheck --workspace=api
npm run test --workspace=extension
npm run lint --workspace=web
npm run build --workspace=web
npm exec --workspace=extension -- playwright install chromium
npm run test:security --workspace=web
npm run build:dev --workspace=extension
npm run test:browser --workspace=extension
npm audit
npm audit --omit=dev
```

This is remediation with repeatable regression evidence, not an unconditional production security certification. No third-party sites, real user credentials, production database or live deployment were attacked.
