# Phase 08: Save and update credentials

Status: implemented under the user's combined approval for Phases 6–8, with conservative capture limitations below.

## Delivered behavior

The unlocked vault provides Save credentials tools: manually Add credential, Watch submission, Review capture, and Discard pending capture. Every create/update requires an explicit confirmation checkbox and button. Manual drafts may omit a website; any supplied website must be absolute HTTPS. Shared Zod validation applies locally, with a 4096-character extension password bound.

Watch submission explicitly arms a packaged isolated script on the current HTTPS top-level document for at most two minutes. It watches the next trusted form submission, including forms rendered after arming. It neither submits nor prevents submission. Login capture requires one visible account field and one password field. Password-change capture selects matching new-password fields (one or two), ignores current-password fields, and refuses mismatched confirmation values. Cross-origin actions/submitter overrides, hidden fields, ambiguous accounts/passwords, and untrusted synthetic submit events are refused.

The extension badge shows 1 when an encrypted capture arrives. Reopen the popup from the same website/tab, unlock, open Save credentials, and Review capture. A submitted login does not establish success: the review explicitly asks the user to check the website/account and only save after confirming success. Failed attempts are never automatically saved. Choosing a saved account at the exact origin offers Confirm update; only its password changes, preserving its title/account/URL/notes. Multiple accounts remain explicit choices and no account is guessed or overwritten automatically.

## Capture security and lifetime

The worker creates an ephemeral RSA-OAEP public/private pair for each armed watch. Only the public key and a random capability token go to the bound isolated script. The captured entry is locally AES-256-GCM encrypted with a fresh random key/nonce and token as authenticated additional data; that key is wrapped with RSA-OAEP. Only ciphertext, nonce, wrapped key, and token enter extension messages. The worker stores one bounded encrypted capture and its nonextractable private key in memory. These capture keys are independent of the vault key. Raw temporary buffers are wiped where feasible; JavaScript strings/garbage collection cannot guarantee physical erasure.

The receiver requires the exact registered token, browser-provided tab ID, top frame, documentId, and HTTPS origin. Content scripts can submit that encrypted capture only; they cannot start a watch, retrieve captures, request a vault/API operation, or fill credentials. The trusted exact popup revalidates the authenticated verified account before arming/taking. Review additionally requires the source tab and origin; a separate tab at the same hostname cannot retrieve it. Before decryption, session/account/expiry/cancellation checks apply. Decrypted capture data exists transiently during worker response and then in the unlocked popup review; the worker does not retain plaintext. Captured data is untrusted and is schema/origin validated again in the popup.

Popup closure still locks the vault but an explicitly armed watch may briefly outlive it. No vault key or saved vault plaintext is kept in the worker. Manual lock, login/logout, discard, replacement watch, successful review, expiry, or worker restart drops the pending private key/ciphertext. A watcher still running in a departed/unreachable document cannot deliver to a cancelled token. The visible document's listener expires after at most two minutes; ordinary navigation destroys that isolated document and listener. There is no persistent watcher, key, plaintext, IndexedDB, local/sync/session storage, all-sites permission, or offscreen keepalive. Worker suspension may discard a capture sooner than two minutes; the badge clears on the next worker start.

## Local encryption and backend changes

VaultSession validates the draft and server session, encrypts through the existing shared AES-GCM helper using its private nonextractable key, and sends only ciphertext/nonce plus account/concurrency metadata through the trusted popup protocol. The worker permits fixed POST /vault and PATCH /vault/:id operations and verifies returned ownership/ciphertext. A successful response updates the popup's private records without re-deriving or exposing the key. Locking/account change rejects late UI results. A request already dispatched may complete after lock; it is encrypted and was confirmed while unlocked. Failed responses do not retry automatically because an uncertain POST result could otherwise duplicate a saved entry; check the web vault before retrying.

Two small backward-compatible backend safeguards were necessary:

- Optional X-Vault-Account binds an extension mutation to the account that encrypted it. The server checks the authenticated user atomically within that request, refusing session-switch races. Existing web callers can omit it.
- Optional expectedCipherText on PATCH makes the prior ciphertext part of the database UPDATE condition. A concurrent change produces HTTP 409 rather than overwriting another edit. Existing web PATCH bodies remain valid.

No authentication redesign, crypto format change, session token storage, schema migration, or new dependency was introduced. Restart the API to load these route changes before using extension create/update.

## Implementation files

- content/capture.ts: explicitly armed top-document watcher and local hybrid encryption.
- background/capture.ts: bounded capability/session/origin broker and ephemeral keys.
- background/index.ts: capture dispatch, badge, and login/logout cleanup.
- popup/sites/captureClient.ts: document-bound arming, review, and discard.
- popup/vault/SavePanel.tsx: manual drafts, review, explicit account/confirmation controls.
- popup/vault/session.ts: private-key encryption and guarded local record updates.
- messaging/write.ts, api/write.ts, vault/client.ts, handler.ts: ciphertext-only fixed-endpoint write protocol.
- apps/api/routes/vault.ts: account and concurrent-update guards.

Extension source paths are relative to apps/extension/src.

## Supported limits

Capture is deliberately opt-in. Automatic always-on detection and filling without opening the popup are deferred to the user's later discussion, as is keeping the vault unlocked. Classic full-page navigation can destroy the submission script before asynchronous encryption/message delivery finishes; use manual Add credential if no capture appears. Successful encrypted delivery can survive same-origin navigation while the worker remains alive. Cross-origin redirects require returning to the source origin in the same tab before review. Worker restart, timeout, and reload fail closed rather than persist secrets.

Password-only change forms, shadow DOM, iframe forms, unnamed/ambiguous account fields, scripted submissions that skip the submit event, and mismatched confirmations are unsupported. Manually add a credential instead. Empty legacy vaults retain Phase 3's restriction: create the first credential in the web app. HTTP sites are not eligible for capture/fill. Compromised authorized pages can already read their form values; capture review and origin checks do not establish that a website is honest.

## Manual validation

```powershell
npm run build:dev --workspace=extension
npm run extension:test
npm run test:browser --workspace=extension
```

Restart the API and reload the extension at chrome://extensions or edge://extensions. No database migration is required.

1. Unlock a populated vault; manually add a disposable credential. Confirm save is disabled until confirmed, cancel writes nothing, and the saved record appears after web/extension reload.
2. On a matching HTTPS test login form, open the toolbar popup, unlock, arm Watch submission, close, and submit yourself. A badge indicates a delivered capture. Reopen from the same tab/origin, unlock, Review capture, check the account, and confirm a new save. No save should happen before confirmation.
3. On a test password-change form with an account field, current-password and matching new-password fields, arm/submit/review and explicitly choose the intended saved account. Confirm only its password changes.
4. Discard, manual lock, logout, expiry, or restart the worker before review. Pending captures should disappear. Confirm a different tab/frame/origin cannot deliver or retrieve them.
5. Edit the same saved credential from the web while an extension snapshot is open, then try an update from that stale snapshot. HTTP 409 should leave the newer web edit intact. Lock/unlock before retrying.
6. Check Chrome and Edge native toolbar behavior; do not use live sensitive accounts for destructive or navigation-race tests.

Automated tests use encrypted public fixtures and isolated profiles, without Neon, real email, or live accounts. The HTTPS interaction fixture's existing API host grant permits real packaged isolated scripting; native toolbar activeTab grants remain manual tests. Unit tests exercise forged tab/frame/document/origin messages, tampering, expiry, cancellation, restart/account switches, local encryption compatibility, ciphertext-only writes, and the actual Hono route's atomic SQL guard with mocked database execution. Browser tests exercise form probing/fill, dynamic/multiple forms, document navigation rejection, explicit saves, reopening/decryption, popup-closure capture, password-change updates, and cancellation/manual-lock behavior.

## Combined validation record — 2026-10-11

- `npm run extension:test`: 201 unit cases passed across 11 files, including earlier authentication/crypto/matching/lifecycle regressions and the new generator/autofill/capture/write/backend guard cases.
- All 37 unique browser cases validated: the full run passed 36, while the generator case had an ambiguous status selector. Its corrected focused rerun passed against the same final application bundle. All eight packaged interaction cases passed in the full run, including popup-close capture and cancelled/manual-lock behavior.
- TypeScript checks passed for the extension, Next.js web app, and Hono API.
- Development and HTTPS production extension builds passed. The production fixture output is separate and ignored; reloadable dist still uses the existing local API. Existing Zod/Rollup annotation warnings remain nonblocking.
- Reviewed popup detail/generator screenshots. Manifest inspection confirms activeTab/scripting only, unchanged API host access, strict CSP, and no persistent content scripts or external messaging.
- Sensitive logging/storage/page-message scans of the new implementation found no console, local/session/chrome storage, postMessage, or eval usage. `git diff --check` passed.

No live account/database/email operation or store publication was performed. Native Chrome/Edge toolbar grants and site-specific framework behavior remain manual checks; unsupported patterns are described above.
