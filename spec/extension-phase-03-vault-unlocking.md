# Phase 03: Vault unlocking

Status: implemented with a deliberate empty-vault restriction. Phase 4 requires confirmation.

## Delivered behavior

Verified accounts can enter their vault password, derive a non-extractable AES-256-GCM key locally, and decrypt and validate existing credentials. The popup shows an unlocked state and credential count; browsing, reveal, copy, and autofill remain later phases. Manual lock and cancel-unlock controls are available. The submitted password input clears immediately.

The key and decrypted entries belong to a private VaultSession instance in the popup. They are never placed in React's published state, extension messages, worker state, persistent storage, or console output. Published state contains only status, count, and a fixed error code. Manual lock, logout, session loss/expiry, verification loss, account switch, popup pagehide/unmount, or reload remove the private references and invalidate pending operations. Late fetch, derivation, decryption, or revalidation results cannot restore a cancelled vault.

Closing the toolbar popup destroys its memory and locks the vault. Closing and reopening the popup preserves the browser-managed login session but requires the vault password again. Worker suspension does not lose a key held by a still-open popup, and waking the worker cannot recover a key for a new popup. No keepalive tricks or offscreen documents were introduced.

## Password verification and legacy/empty vault decision

The repository has no persisted encrypted password-verification value. The existing web unlock helper accepts a derived key without checking it first. Derivation succeeds for incorrect passwords as well, so copying that behavior would falsely report successful unlocking.

For populated vaults, the extension authenticates every AES-GCM record and validates every decrypted credential with the shared schema before accepting the key. It also rechecks the server session after derivation/decryption. A wrong password, tampered entry, malformed credential, or session/account change keeps the entire vault locked. No partially decrypted vault is retained. Wrong passwords and damaged ciphertext cannot always be distinguished, so the error explains both possibilities.

An empty legacy vault has no authenticated ciphertext to prove which password is correct. This phase keeps it locked and instructs the user to create their first credential in the web app, then retry. It does not write a verifier or silently establish a password. This also applies if all credentials have been deleted. There is no database migration or new API endpoint in this phase. The web app's existing initial-credential flow remains available; its general unlock-verification weakness is not claimed fixed by extracting shared primitives.

A future empty-vault setup should use a dedicated encrypted verifier containing, for example, `{kind: "vault-verifier", version: 1, userId: "..."}`, encrypted with the same derived key and a fresh nonce. Store it separately from credentials so old web clients do not render it as a credential. Existing populated vaults may create it only after successfully validating their existing ciphertext. Empty vaults require an explicit setup/confirmation flow, not automatic creation during an unlock attempt. Creation must be authenticated, verified, and conditional on no existing verifier to prevent concurrent replacement. This requires a reviewed additive API/schema migration and coordinated web setup. This proposal is documented, not implemented or required to use populated vaults.

## Shared packages and compatibility

- `packages/crypto` exports the original raw derivation API, a non-extractable-key helper, and AES-GCM encrypt/decrypt functions. It pins the already-used hash-wasm 4.12.0 implementation.
- Argon2id preserves the Base64 salt string as TEXT, three iterations, 64 MiB memory, parallelism one, and 32-byte output. Decoding the salt first would break existing vaults and is deliberately avoided.
- AES-GCM preserves 12-byte random nonces, 128-bit authentication tags, UTF-8 plaintext, and standard padded Base64 ciphertext/nonce encoding. Malformed Base64, wrong nonce lengths, short ciphertext, and invalid decrypted UTF-8 are rejected.
- Temporary raw key and plaintext byte buffers are overwritten where practical. JavaScript strings, library internals, and garbage collection prevent a guarantee of physical memory zeroization; non-extractable keys are not a defense against arbitrary malicious extension code.
- `packages/shared` contains the existing credential schema and typed encrypted/decrypted envelopes. Web validation and crypto modules re-export shared functions, preserving their existing imports and normal valid-vault format.
- The web unlock helper also uses the shared non-extractable-key helper, removing its duplicate import operation and overwriting temporary derivation buffers while preserving its existing setup behavior.
- A frozen compatibility fixture was generated independently with native Node Argon2id and Web Crypto. It checks salt interpretation, parameters, and the original encrypted format rather than merely round-tripping a new implementation against itself.

## API and messaging boundary

Only the exact packaged popup may request `vault/snapshot`. It accepts no password, key, arbitrary URL, or other payload. The worker uses the existing fixed GET /user/me and GET /vault endpoints with cookies included, redirects/caching disabled, and a 15-second timeout. It verifies email status, session expiry, account identity across reads, and ownership of every encrypted record. Responses strip unexpected fields. The complete snapshot is capped at 8 MiB, 5,000 entries, and 1 MiB of Base64 ciphertext per entry; larger vaults fail closed with an explicit data-size error.

The popup performs all derivation/decryption and checks the account again after decryption. The worker sees only public salt/profile metadata and encrypted credentials. No vault password, raw key, decrypted key, or credential plaintext is sent to the API or worker. Existing login passwords still reach the authentication API as before. Reusing an account password for vault encryption retains the existing limitation on zero-knowledge claims against the authentication server.

Manifest permissions remain limited to the API host. The CSP now allows only the additional `'wasm-unsafe-eval'` directive required for packaged Argon2 WebAssembly. It does not allow JavaScript unsafe-eval, remote executable code, content scripts, general tab access, or storage/cookie API access. hash-wasm embeds its WASM in the local bundle. See [Chrome CSP requirements](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy) and [hash-wasm](https://github.com/Daninet/hash-wasm).

## Setup and testing

From the repository root:

```powershell
npm install --ignore-scripts
npm run build:dev --workspace=extension
npm run extension:test
npm run test:browser --workspace=extension
node node_modules/typescript/bin/tsc --project apps/web/tsconfig.json --noEmit --incremental false
```

Reload the unpacked extension at chrome://extensions or edge://extensions and reopen the popup. Its Phase 2 ID remains unchanged. No database migration or new environment setting is needed.

Manual Chrome/Edge checks:

1. Use a verified account with a saved credential. Enter the same vault password used for that credential in the web app; confirm the unlocked count.
2. Lock, try a wrong vault password, and confirm it stays locked with the input cleared.
3. Unlock, close/reopen the toolbar popup, and confirm it is locked while still signed in. Reload the extension and check again.
4. Stop the worker while the popup is open. The popup owns its key; a subsequently opened popup must start locked.
5. Cancel during loading, logout while unlocked, and switch accounts or revoke the session from the web app. Revalidation must clear the vault; cross-client revocation is observed on focus, polling, or the next request.
6. Try an empty account. Confirm the web-first-credential message rather than a successful unlock. Do not overwrite or delete live credentials to manufacture corrupted-data tests; those use public fixtures.
7. Verify web create/edit/decrypt still works after installing the shared workspaces. Credential browsing in the extension follows in Phase 4.

## Dependency audit and limits

The extension's production dependency audit reports zero vulnerabilities. The full repository audit reported 10 advisories in existing Next.js, sharp, shell-quote/concurrently, and glob/lint dependencies (7 high, 3 critical). No advisory implicated the new crypto/shared production dependency chain. They need a separate targeted dependency patch; broad npm audit fix/force and framework upgrades were not applied during this phase.

Browser automation uses isolated Chromium profiles and public legacy fixtures. Actual Chrome/Edge toolbar behavior, production hosting, and live Neon accounts remain manual checks. No live vault, database, or verification email is modified by tests. Strict validation can reject malformed historical entries; this is intentional and leaves them available for inspection in the web app. Empty-vault verifier setup remains the separate migration proposal above.

## Validation record (2026-10-11)

All 103 unit tests and all 18 Chromium browser tests passed. The suite includes independent legacy-vector compatibility, non-extractable keys, wrong passwords, ciphertext tampering, nonce/UTF-8/schema validation, no partial unlock, cancellation races, account/session/verification changes, API 401/403, popup reopening, worker stop/restart, and storage/message/network boundaries. The unlocked popup screenshot was visually reviewed. Extension, API, and web typechecks passed; development and production builds passed. Production used a public example HTTPS API origin and a separate ignored output directory, preserving the development bundle. The source scan found no console logging or persistent storage calls in extension/shared code, and git diff --check passed. Vite emits harmless annotation-placement warnings from Zod; they do not prevent either build.
