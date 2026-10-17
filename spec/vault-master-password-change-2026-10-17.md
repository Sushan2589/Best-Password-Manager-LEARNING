# Web vault master-password change

**Update:** password changes now submit directly with current-password reauthentication and fresh MFA when enabled, with no email-code step. See [current password changes](password-change-without-email-2026-10-17.md).

Implemented on 2026-10-17. The form is in **Account → Account security → Vault master password**. Changing passwords from the extension is intentionally out of scope, as requested.

## What changes

This changes the **vault unlock password**. The account password used to sign in remains unchanged. These are separate inputs in the existing application, even if someone originally chose the same value for both.

The operation requires:

- A live, email-verified account session.
- The current account sign-in password, checked by the existing server Argon2 verifier.
- The current vault master password, checked locally against the encrypted verifier and every saved entry.
- A different, confirmed master password of at least 15 characters, maximum 1024 UTF-16 code units.
- A fresh authenticator code or unused recovery code when MFA is enabled. Recent MFA authentication does not bypass this requirement.

An empty legacy vault without an encrypted verifier must first be initialized through the existing web unlock/setup flow. There is no encrypted evidence against which its old password could otherwise be checked. Populated legacy vaults without a verifier remain supported.

## Encryption and transaction

1. Lock this web tab and fetch `GET /vault/rotation-snapshot`. One SQL statement returns the account's salt, verifier, encrypted entries, revision and key version together.
2. Derive the old non-extractable key with the existing shared crypto implementation. Verify the password and validate every decrypted entry before preparing replacements.
3. Generate a new random 16-byte Base64 salt. Derive the new key using unchanged Argon2id settings: three iterations, 65,536 KiB memory, one lane, 32-byte output. Preserve the existing interpretation of the **Base64 salt text**, rather than decoding it before derivation.
4. Re-encrypt every original plaintext JSON string with AES-256-GCM and a fresh 12-byte nonce. Check every ciphertext by decrypting it with the new key. Create and verify a new owner-bound encrypted verifier. Credential IDs, creation/modification timestamps, notes, approved login origins and unknown future JSON metadata are preserved.
5. Lock other updated web tabs through an origin-scoped BroadcastChannel containing only a fixed lock notification.
6. Submit `POST /vault/change-password` with account reauthentication, optional MFA proof and encrypted replacements. Neither master-password field, either vault key, nor plaintext entries are included in this payload. Account reauthentication intentionally transmits the account password over the existing HTTPS authentication boundary; reusing that same value as a master password does not make it secret from that boundary.
7. One PostgreSQL data-modifying CTE changes the salt, verifier and all owned ciphertexts, increments the vault revision/key version/session version, and deletes every account session. Any database error rolls the entire statement back. The account password hash and MFA enrollment stay unchanged.
8. Clear the web session cookie, show explicit sign-in instructions, and send a generic security-notification email. Notification failure cannot undo a committed rotation and never logs recipient details or credentials.

This reuses the current direct password-to-vault-key design. It does not introduce a wrapped encryption key or alter the encryption format. JavaScript strings and CryptoKeys cannot be deterministically wiped: the implementation drops references, clears form fields promptly, and keeps keys non-extractable and memory-only. No persistence of plaintext or keys is added.

## Concurrent edits and stale clients

Every supported vault create, edit, delete and first-verifier setup now updates `users.vault_revision` under the same account-row write lock used by rotation. This serializes writers. Rotation checks its expected revision/salt, the reauthenticated password hash, live session ID and session version, and the complete set of owned entry IDs before changing anything. Both schema validation and SQL reject repeated UUID identities, including differently cased copies of the same ID; they cannot replace a missing entry with a duplicate and strand it under the old key.

The shared account-row revision matters: under PostgreSQL Read Committed, merely inspecting item timestamps or locking a user row does not refresh the statement's snapshot of concurrently inserted items. A writer that commits first changes the revision, causing the waiting rotation's updated-row predicate to fail. If rotation wins first, a stale writer fails its salt/session predicate.

Web writes and extension saves send `X-Vault-Salt` taken from the salt used to derive their in-memory key. They never attach a freshly fetched salt to ciphertext made with an old key. The server accepts missing salt headers only for never-rotated accounts (`vault_key_version = 0`), preserving older clients until the first change. After rotation, headerless or wrong-salt writes return 409, even after a fresh sign-in. A reload/update and unlock is required.

`/user/me` exposes a non-sensitive `vaultKeyVersion`. The updated extension validates it and locks on version changes, including a new same-account session received while an old worker still holds a key. Existing servers/fixtures without the field are interpreted as version zero. The web key store binds its key to account and salt, and authorization/polling rejects a changed salt.

Extension plaintext already in memory cannot be remotely erased instantly. Existing session validation rejects revoked sessions before fresh credential exposure/fill/save and when reopening the popup; worker idle/absolute limits continue to apply. The key-version check also rejects an old key if a fresh valid same-account cookie replaces the revoked one. Web BroadcastChannel notifications apply only to updated tabs on the same origin/browser profile; other clients observe revocation on their next validation. No push infrastructure or key persistence is introduced.

## Failure handling and limits

- Wrong current password, damaged/invalid entries, mismatched confirmation, cancellation during preparation or oversized payload: no commit request is sent.
- A rejected stale snapshot returns 409 without replacing vault data. Close other edits, reload/sign in and prepare a new snapshot.
- The UI allows cancellation during preparation, disables it once commit starts, and aborts pending work on unmount. Generation checks prevent delayed crypto work from submitting after a manual lock or another tab's lock event.
- A lost response or unexpected server error after submission is an **unknown outcome**, not a claimed rollback. Never automatically retry the POST. Sign in with the unchanged account password, try the new master password, and try the old one if necessary. The UI explains this.
- Snapshot responses are bounded to 8 MiB and 5,000 entries. The complete commit body must fit the existing 3 MiB vault request limit. Larger vaults fail before saving; chunked partial rotation is deliberately unsupported.
- A failed attempt leaves the local vault locked. An MFA code can be consumed even if a subsequent revision conflict rejects the rotation; retry with a fresh code.
- Current process-local rate limits still apply: 60 sensitive POSTs/IP/15 minutes and 10 reauthentication POSTs/account/15 minutes, shared with other sensitive account actions. Existing password-verification concurrency limits apply. Arcjet/distributed enforcement remains deferred as previously agreed.
- The backend validates ownership, session state, envelope shapes and exact item membership; it cannot validate ciphertext contents or prove knowledge of the old master password without changing the zero-knowledge protocol. A compromised authenticated client can already overwrite vault ciphertext using ordinary writes. The trusted web client performs the password/decryption/roundtrip checks.
- Old database backups or copied ciphertext are not re-encrypted. A password change cannot revoke offline copies or previously disclosed website passwords.

## Database migration and rollout

**The real Neon database has not been changed by this task.** Apply the additive migration before running the updated API:

`apps/api/migrations/20261017_vault_password_rotation.sql`

```sql
BEGIN;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_revision integer NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_key_version integer NOT NULL DEFAULT 0;
COMMIT;
```

The earlier `20261012_security.sql` migration remains a prerequisite. The new migration only adds defaulted metadata columns; it does not replace existing salts, verifiers or ciphertexts. It is safe to apply repeatedly. Use the Neon SQL editor against the intended branch/database, with your normal private database backup/branch available. Do not put database credentials or plaintext exports in this repository.

Recommended rollout order:

1. Apply the migration and confirm both columns exist. `npx drizzle-kit push` is optional afterward for schema reconciliation; do not accept unrelated destructive changes.
2. Deploy the updated API everywhere and stop old API instances before enabling the new web feature. Old API writers do not maintain revisions and cannot safely coexist with active rotation.
3. Deploy the updated web app. Rebuild/reload the extension (`npm run build:dev --workspace=extension` for local development, then Reload on the browser extensions page).
4. Hard-refresh existing web tabs. Test with a disposable account first.

Once any account has rotated, keep the upgraded API write guards deployed. Rolling back to an old API that ignores salt/version guards would weaken stale-client protection. Treat a database restoration as a complete coordinated vault-state restoration, never restore only the salt or only some item rows.

## Files

- `apps/web/src/app/components/account/ChangeMasterPassword.tsx`: dedicated, responsive form and preparation/commit status.
- `apps/web/src/lib/crypto/changeMasterPassword.ts`: local preparation, roundtrip checks, bounded snapshot fetch, single commit request and ambiguous-outcome handling.
- `apps/web/src/lib/crypto/vaultKeyStore.ts` and `vaultSession.ts`: account/salt binding and cross-tab locking.
- `apps/api/routes/vaultPassword.ts`: snapshot and reauthenticated change endpoints.
- `apps/api/src/services/vaultRotation.ts`: coherent snapshot and atomic rotation SQL.
- `apps/api/src/services/vaultMutation.ts`: serialized ordinary writes and initialization.
- `packages/shared/src/vault.ts`: existing schemas moved without changing their definitions, plus strict rotation schemas. Its package subpath allows NodeNext API imports without pulling the browser generator entry point; existing root imports remain supported.
- Extension auth/profile/session/write modules: public key-version checks and encryption-salt binding, with no new change-password screen or permissions.

## Automated validation

Local results: API typecheck and all **56 API tests** passed; all **315 extension/shared/web-crypto unit tests** passed; web lint, production build and the production security-browser script passed; extension typecheck/development build passed. All **64 existing extension browser tests** passed, followed by all **12 vault lifecycle browser checks** on the rebuilt extension, including the new same-account key-version regression. The suite now contains 65 distinct extension browser cases. A final focused master-password unit rerun also covers the final shared-schema guards.

Commands use public fixtures and a local in-memory PostgreSQL-compatible PGlite database. They do not need a running API, contact Neon or send real email.

```text
npm run typecheck --workspace=api
npm run test --workspace=api
npm run test --workspace=extension
npm run lint --workspace=web
npm run build --workspace=web
npm run test:security --workspace=web
npm run build:dev --workspace=extension
npm run test:browser --workspace=extension
```

New database tests exercise actual PostgreSQL statements: full rotation, owner isolation, preserved timestamps, unchanged account password/MFA, session revocation, replay rejection, inserts/updates/deletes invalidating snapshots, wrong session/salt/revision/password-hash guards, pre-rotation compatibility, post-rotation create/edit/delete and fresh sign-in. A database trigger deliberately raises an exception during an entry update to prove salt/verifier/ciphertexts/session changes all roll back.

Client tests cover real AES roundtrips, wrong/weak/reused/mismatched passwords, damage to the last entry, initialized and legacy empty/populated vaults, preserved unknown metadata, cancellation/manual-lock races, encrypted-only request bodies, rejected and ambiguous requests without automatic retries, stale extension salts, same-account key-version changes, and salt changes during web authorization. Existing fixed Argon2/AES vectors remain in the suite.

The production web browser test drives the actual form, rejects a wrong master password without a POST, performs real Argon2/AES rotation, decrypts the captured encrypted request with the new password, verifies cleared inputs/sign-out instructions, and proves another unlocked web tab locks. Existing XSS/CSP/MFA/session controls continue to run in that script. Existing CI commands discover the added tests automatically; no separate live-server dependency is added.

PGlite checks database semantics and stale snapshots, but does not simulate separate production PostgreSQL connections, a Neon transport failure during commit, or malicious browser extensions. Production multi-instance load/race tests and independent cryptographic/security review remain additional assurance, not claims made by this suite.

## Manual acceptance checklist

1. On a disposable verified account, create at least two entries, including notes and an extension-approved alternate login origin. Confirm web and extension unlock/fill/save work.
2. Open the web vault in one tab and Account security in another. Try a wrong old master password and mismatched confirmation. Confirm nothing changes and there is no change-password POST for the wrong password.
3. Change to a unique 15+ character passphrase, supplying the account password and a fresh MFA/recovery code if enabled. The other web tab should lock, and all sessions should require sign-in.
4. Sign in with the **old account sign-in password**. The old vault password should fail; the new vault password should unlock every original entry with its notes/approved origins intact.
5. In the reloaded extension, sign in again and unlock using the new vault password. Check search, reveal, copy, suggestions, explicit autofill, new saves and updates. Back in the web app, check create/edit/delete.
6. Prepare a change while editing the vault in another client. A stale snapshot must return a conflict rather than overwrite the newer edit. A freshly signed-in client still using an old key must fail saves and lock before exposing/filling credentials.
7. Test a verified empty initialized vault and a populated legacy vault. An uninitialized empty vault must request setup first. If the final save response is lost, follow the UI's new-password/old-password unlock check rather than assuming failure and retrying the change.

## Design references

- [PostgreSQL Read Committed isolation and updated-row predicate rechecks](https://www.postgresql.org/docs/current/transaction-iso.html).
- [OWASP key management guidance](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html).
