# Browser extension roadmap

## Architecture and scope

The extension is an npm workspace at `apps/extension`. React, TypeScript, Vite, Tailwind CSS, Lucide, and Chrome Manifest V3 provide the popup and background-worker foundation. The existing Hono API, database sessions, and encrypted vault remain authoritative.

Phase 9 replaces the initial popup-only policy with a memory-only dedicated crypto
worker in an offscreen host. Five-minute inactivity is the default, with fifteen
minutes or popup-close locking available and a one-hour/session-expiry maximum.
No key or decrypted vault is persisted. The user approved this follow-up by
requesting longer sessions and filling without opening the popup.

The background accepts a typed vault protocol only from packaged popup and fill-window UI. Content scripts are untrusted callers and cannot request arbitrary API URLs or the vault; an explicitly armed capture can submit only bounded encrypted data from its bound top document. The extension-owned field picker receives only matching account summaries and requests a selected-account fill through a restricted broker. Popup, shortcut and field-picker fills are explicitly user initiated, HTTPS-only, exact-origin matched against the primary website or an encrypted user-approved origin, and bound to the top-level document and form. No login form is submitted automatically.

Phase 3 extracted crypto/schema helpers into `packages/crypto` and `packages/shared`. Web compatibility wrappers preserve existing imports. No empty shared packages were created in Phase 1.

## Phase documents

| Phase | Specification | Status |
| --- | --- | --- |
| 1 | [Foundation](extension-phase-01-foundation.md) | Implemented; see validation record |
| 2 | [Authentication](extension-phase-02-authentication.md) | Implemented; see validation record |
| 3 | [Vault unlocking](extension-phase-03-vault-unlocking.md) | Implemented for populated vaults; empty-vault setup deferred |
| 4 | [Credential browsing](extension-phase-04-credential-list.md) | Implemented; see validation record |
| 5 | [Website matching](extension-phase-05-website-matching.md) | Implemented; see validation record |
| 6 | [Secure autofill](extension-phase-06-secure-autofill.md) | Implemented; conservative top-form support |
| 7 | [Password generator and settings](extension-phase-07-password-generator.md) | Implemented; shared web/extension generator |
| 8 | [Save and update credentials](extension-phase-08-save-credentials.md) | Implemented; explicit bounded capture/review |
| 9 | [Longer unlock sessions](extension-phase-09-longer-unlock-sessions.md) | Implemented; memory-only bounded crypto-worker ownership |
| 10 | [Fill without popup](extension-phase-10-fill-without-popup.md) | Implemented; trusted chooser, shortcut/menu, optional exact-host page control |
| 11 | [Field suggestions](extension-phase-11-field-suggestions.md) | Implemented; extension-owned field picker and focused-form filling |
| 12 | [Global suggestions](extension-phase-12-global-suggestions.md) | Implemented; one-time HTTPS website permission and automatic suggestions |
| 13 | [Approved login websites and multi-step forms](extension-phase-13-login-origins-and-multistep.md) | Implemented; explicit encrypted exact-origin approvals and separate login steps |
| 14 | [Generic login detection](extension-phase-14-generic-login-detection.md) | Implemented; form-less groups, accessible field semantics and open shadow roots |

Each phase records implementation, validation, limitations, and manual testing instructions. The user approved Phases 6–8 together without further stops, then authorized Phases 9–10.

See [the inline-fill discussion](extension-followup-inline-fill.md) for the original lifecycle and permission decision points.

## Existing-system findings

- Phase 2 added `emailVerified` and `sessionExpiresAt` to `GET /user/me`; existing fields remain compatible.
- Sessions are hashed in the database, expire after seven days, and use an HttpOnly cookie. Production must use HTTPS and Secure cookies. Test extension cookies in Chrome and Edge before selecting any fallback.
- Existing `unlockVault()` does not validate a password before accepting a derived key. An encrypted verification value needs a compatibility/bootstrap plan, including empty vaults.
- Preserve Argon2id's current salt-string interpretation, parameters, AES-GCM nonce size, and ciphertext encoding when extracting shared code.
- Changing email currently preserves verification. Phase 2 added exact mutation-origin/CSRF checks; server-side login abuse controls remain a deployment prerequisite.
- Login passwords reach the authentication server. Reusing that password as the vault password limits strict zero-knowledge claims against that server.
- Phase 2 checks Resend's returned error result and builds verification links from the configured web origin.
- The existing frontend loads Google favicons. The extension uses local icons and system fonts to avoid third-party domain disclosure or remote assets.
- Before Phase 1, no Vitest/Playwright suites were configured. The extension now introduces focused test tooling.

## References

- [Extension network requests](https://developer.chrome.com/docs/extensions/develop/concepts/network-requests)
- [Extension cookies](https://developer.chrome.com/docs/extensions/develop/concepts/storage-and-cookies)
- [Service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Content security policy](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy)
- [Temporary activeTab access](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Testing extensions with Playwright](https://playwright.dev/docs/chrome-extensions)

See [the extension testing checklist](extension-testing-checklist.md) for automated commands and manual Chrome/Edge checks.

Compatibility follow-up: [Google sign-in form detection](extension-fix-google-form-detection.md) records the hidden-password/named-control fix, live-page verification and reload instructions.
