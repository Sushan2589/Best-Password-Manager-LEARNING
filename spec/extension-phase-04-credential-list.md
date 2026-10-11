# Phase 04: Credential browsing

Status: implemented. Phase 5 requires confirmation.

## Delivered behavior

The unlocked popup displays validated credentials from the existing Phase 3 decrypted snapshot, sorted by title/account. Rows show title, associated username or email, and an ASCII website hostname. Multiple accounts for the same website remain separate. Search matches title, username, email, and website without searching passwords or notes. Clear-search and no-match states are included.

Selecting a row opens its details: username, email when present, masked password, website, and notes. Passwords appear in the DOM only after an explicit reveal action. They hide on blur, when leaving the detail view, on lock/logout/session loss/account switch, and after popup closure/reopening. Going back preserves the current search; leaving the Vault section or relocking resets the browsing state. Text is rendered by React, including notes that resemble HTML. Icons are packaged Lucide SVGs; there are no remote favicon requests.

Copy username, email, and password controls operate on the selected field only. Success and failure messages never echo copied values or raw OS diagnostics. Website opening uses a new tab and adds no username, password, or other credential data to the URL. Missing/unsafe websites have no opening control. HTTP links are supported for navigation and explicitly labelled HTTP; autofill and domain trust are later phases.

Manual lock and logout remain available. The popup locks on closure exactly as in Phase 3. The user's suggestion to stay unlocked across popup openings is a future lifecycle change, not part of this phase.

## Data and security boundaries

VaultSession keeps its key and decrypted records in popup memory. New read methods return password-free list summaries or a copy of one selected credential only while the vault is unlocked, verified, and its known session has not expired. Modifying a returned copy cannot modify the private vault. No key is exposed to the UI. The browsing components may hold selected plaintext references while unlocked; they unmount and drop those references on lock/account/session changes. JavaScript garbage collection still prevents guaranteed physical memory erasure.

No new backend endpoint, database migration, cryptographic format, dependency, persistent storage, host permission, or extension message was introduced. The background worker and content-script boundary remain unchanged: ciphertext fetches use the existing routes, and decrypted records never go to the worker or a website. Credential browsing uses the already validated snapshot; changes made in the web app are loaded on the next unlock, rather than silently merging into an open decrypted vault.

Only absolute HTTP(S) website URLs with a hostname, no URL userinfo, and no whitespace/control characters may open. JavaScript, data, file, browser-internal, extension, mailto, malformed, and credential-bearing URLs are rejected. URL parsing produces normalized ASCII hosts for display. These checks make navigation safe; they do not establish trust for autofill. Matching and phishing protections remain Phase 5/6 work. The URL's existing path/query/fragment are preserved, with no credentials appended by the extension.

Clipboard writes occur directly from the user's click while the extension page is focused, using navigator.clipboard.writeText. No clipboardRead/clipboardWrite permissions, clipboard inspection, automatic copying, or deprecated copy fallback were added. Browsers/policies that deny writes show a retry message. The selected credential is read again at action time, so a locked or expired vault cannot start a copy/open action. Late results cannot restore a departed detail view or display success after locking. A write already handed to the browser cannot reliably be cancelled.

Copying intentionally moves a selected value outside extension memory into the device clipboard. It may remain there after locking or be retained by an OS clipboard manager. The detail view explains this. The extension neither reads the clipboard nor automatically overwrites it later, which could erase unrelated user data.

References: [clipboard user activation](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Interact_with_the_clipboard), [Chrome tab creation permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs).

## Implementation files

- `src/popup/vault/session.ts`: guarded list/detail reads; the private key stays inaccessible.
- `src/popup/vault/useVault.ts`: exposes popup-only read functions to its components.
- `src/popup/vault/credentials.ts`: metadata search, safe URL handling, copy/open actions.
- `src/popup/vault/CredentialBrowser.tsx`: list, search, details, reveal/copy feedback, and browsing-state cleanup.
- `src/popup/vault/VaultPanel.tsx`, `src/popup/App.tsx`, and styles: compact unlocked layout and retained lock controls.
- Unit/browser credential suites cover the new behavior; earlier authentication/crypto/lifecycle tests remain in place.

Paths in this section are relative to apps/extension.

## Setup and validation commands

```powershell
npm run build:dev --workspace=extension
npm run extension:test
npm run test:browser --workspace=extension
```

Reload the unpacked extension at chrome://extensions or edge://extensions and reopen its popup. The ID, environment variables, permissions, and backend setup are unchanged; no API restart is required for this phase.

Unit tests cover search (including exclusion of passwords/notes), account ordering, optional fields, HTTP(S)/IDN normalization, unsafe schemes/userinfo/control characters, copy-field selection, clipboard failures, locked action rejection, and defensive record copies. Browser tests cover multiple accounts, search/no matches, reveal reset, literal HTML notes, real click-initiated clipboard writes, copy errors/late completion, missing/unsafe URLs, actual tab opening against a local fixture server, and details/search cleanup after locking.

Clipboard tests use public fixture values. Read permission is granted to a separate test-only HTTPS page, not the extension, after the extension write succeeds. Test diagnostics receive only a comparison boolean, not an unexpected clipboard value. Website-opening tests use a real loopback fixture because Chrome's first tab navigation may bypass Playwright route mocks. These tests do not connect to Neon, send verification emails, or use live accounts.

## Validation record — 2026-10-11

- `npm run extension:test`: 131 unit tests passed, including the new credential browsing/action tests and existing authentication, crypto, and vault tests.
- `npm run test:browser --workspace=extension`: all 24 browser tests passed against the packaged development extension, including the six new credential tests and earlier session/worker/popup lifecycle regressions.
- TypeScript checks and development/production builds passed. The production build used an HTTPS fixture API origin and a separate ignored output directory; the reloadable `dist` remains configured for the existing local API.
- Reviewed list/detail screenshots and corrected search padding and navigation scroll behavior. The manifest retains API-only host access, no content scripts, and no additional permissions.
- `git diff --check` passed. No console logging, persistent storage, or page-message calls occur in the popup vault/browsing code. Existing Zod/Rollup annotation warnings do not prevent either build.

Native toolbar behavior in Chrome and Edge remains covered by the manual checks below.

## Manual Chrome and Edge checks

1. Unlock your populated vault and confirm the list and account labels.
2. Search by title, website, username, and email. Try a query with no results, then clear it.
3. Open a credential. Reveal/hide its password, go back and reopen, and confirm it starts masked. Switching to Settings/Generator should also discard the detail view.
4. Copy username/email/password, paste into a disposable local text field, then remove the pasted value and clear your device clipboard when finished. Confirm no value is shown in success messages.
5. Open a saved website and confirm its URL. Opening a new tab normally closes the toolbar popup and therefore locks this vault. Missing/unsafe website schemes must not offer an opening control.
6. Lock or logout from a revealed detail view. Confirm details disappear and reopening/re-unlocking starts with a fresh search and masked passwords. Repeat with session expiry/account switching.
7. Use several accounts for the same website and optional email/website fields. Confirm each account remains selectable and the popup scrolls within its 400px-by-600px bounds.

## Limits and next phase

Empty legacy vaults retain Phase 3's restriction: create the first credential through the web app before extension unlocking. Corrupted/malformed entries still fail the entire unlock rather than displaying a partial vault. Clipboard contents are outside the popup-lock guarantee. Native Chrome/Edge toolbar behavior and enterprise clipboard policies remain manual checks; automated extension pages are tabs. Existing dependency advisories recorded in Phase 3 remain separate follow-up work.

Phase 5 will identify the active website and safely match credentials. Phase 6 adds explicit autofill. Neither active-tab inspection nor page injection is part of this change. Keeping a key unlocked across popup openings still requires a reviewed Manifest V3 lifecycle design.
