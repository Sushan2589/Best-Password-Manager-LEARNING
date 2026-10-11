# Password Manager extension

Phases 1–5 provide the packaged popup, connection check, login/session management, email verification, vault unlocking/locking, credential search/details, reveal/copy controls, safe website opening, and exact HTTPS website matching. Autofill follows in Phase 6.

From the repository root:

```powershell
npm install
npm run build:dev --workspace=extension
npm run extension:dev
```

Load `apps/extension/dist` through **Load unpacked** at `chrome://extensions` or `edge://extensions`. The watcher rebuilds packaged files; reload the extension and reopen the popup after edits. There is no remote development server.

For the Phase 2 upgrade, restart the API and remove/reload the old unpacked extension. The public manifest key now fixes the development ID to `aeklikmljjjbhgmhofhhmbimkmeajigp`; the API trusts that exact origin in development. See `apps/api/.env.example` for `WEB_ORIGIN` and `EXTENSION_ORIGINS`. Production requires explicit trusted origins and `NODE_ENV=production` for Secure cookies.

Sessions use the existing API's HttpOnly cookies, which may be shared with the web app. The extension never stores passwords or raw session tokens. Closing the popup clears its account profile; reopening checks the server session. A failed server logout remains visible and should be retried.

Vault keys and decrypted credentials remain in popup memory. Closing the popup locks the vault. Unlocking verifies every encrypted entry before accepting the key; empty vaults remain locked until the first credential is created in the web app. No database migration is needed. Shared crypto/schema packages require running npm install after upgrading to Phase 3.

Phase 4 needs only a rebuild and extension reload. Copying is explicit and requires a focused popup; copied values can remain in the device clipboard after locking. Website opening does not send credential fields to the website. No additional permissions or backend changes are needed.

Development defaults to `http://localhost:3001`. Production requires an HTTPS `VITE_API_ORIGIN` in `.env.production.local`, then `npm run extension:build`. Environment values are public build configuration, never secrets.

Phase 5 adds only the activeTab permission. Rebuild and reload the extension, then invoke it from the toolbar on a website to grant temporary URL access. Matching uses exact HTTPS hostname/port; subdomains are not implicitly trusted. Ordinary popup.html tabs do not grant website access. No API restart is needed, and closing the popup still locks the vault.

```powershell
npm run typecheck --workspace=extension
npm run extension:test
npm exec --workspace=extension -- playwright install chromium
npm run test:browser --workspace=extension
```

Browser tests require the default development build. UI tests use mocked responses; cookie/lifecycle tests build a separate bundle against a real loopback Hono fixture. All use isolated Chromium profiles without Neon or email calls. Manual Chrome/Edge toolbar checks remain necessary.

See [Phase 5 specification](../../spec/extension-phase-05-website-matching.md) for matching, permissions, and tests; [Phase 4](../../spec/extension-phase-04-credential-list.md) covers browsing/copying, [Phase 3](../../spec/extension-phase-03-vault-unlocking.md) covers key lifecycle/compatibility, and [the roadmap](../../spec/extension-roadmap.md) tracks later phases.
