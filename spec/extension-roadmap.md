# Browser extension roadmap

## Architecture and scope

The extension is an npm workspace at `apps/extension`. React, TypeScript, Vite, Tailwind CSS, Lucide, and Chrome Manifest V3 provide the popup and background-worker foundation. The existing Hono API, database sessions, and encrypted vault remain authoritative.

Initial unlock policy: closing the popup locks the vault. The popup will own its key and decrypted credentials in memory; the worker will coordinate requests and autofill without caching the vault. Keeping an unlocked key across popup openings requires a separately reviewed design and explicit approval.

The worker accepts a small typed protocol from the exact extension popup. Future content scripts are untrusted callers and cannot request API URLs, vault data, or autofill. Autofill will be explicitly user initiated, exact-host matched, HTTPS-only, and top-frame-only initially. No login form will be submitted automatically.

Phase 3 extracted crypto/schema helpers into `packages/crypto` and `packages/shared`. Web compatibility wrappers preserve existing imports. No empty shared packages were created in Phase 1.

## Phase documents

| Phase | Specification | Status |
| --- | --- | --- |
| 1 | [Foundation](extension-phase-01-foundation.md) | Implemented; see validation record |
| 2 | [Authentication](extension-phase-02-authentication.md) | Implemented; see validation record |
| 3 | [Vault unlocking](extension-phase-03-vault-unlocking.md) | Implemented for populated vaults; empty-vault setup deferred |
| 4 | [Credential browsing](extension-phase-04-credential-list.md) | Implemented; see validation record |
| 5 | [Website matching](extension-phase-05-website-matching.md) | Implemented; see validation record |
| 6 | [Secure autofill](extension-phase-06-secure-autofill.md) | Planned; approval required |
| 7 | [Password generator and settings](extension-phase-07-password-generator.md) | Planned; approval required |
| 8 | [Save and update credentials](extension-phase-08-save-credentials.md) | Planning only until earlier phases are tested |

Each phase records implementation, validation, limitations, and manual testing instructions. Proceed only after the user confirms the previous phase.

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
