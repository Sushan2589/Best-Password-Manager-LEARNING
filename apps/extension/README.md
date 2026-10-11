# Password Manager extension

Phases 1–8 provide login/session management, local vault unlocking, credential browsing, exact HTTPS website matching, explicit document-bound autofill, the shared password generator, and confirmed credential saves/password updates with opt-in submission capture.

From the repository root:

```powershell
npm install
npm run build:dev --workspace=extension
npm run extension:dev
```

Load `apps/extension/dist` through **Load unpacked** at `chrome://extensions` or `edge://extensions`. The watcher rebuilds packaged files; reload the extension and reopen the popup after edits. There is no remote development server.

For the Phase 2 upgrade, restart the API and remove/reload the old unpacked extension. The public manifest key now fixes the development ID to `aeklikmljjjbhgmhofhhmbimkmeajigp`; the API trusts that exact origin in development. See `apps/api/.env.example` for `WEB_ORIGIN` and `EXTENSION_ORIGINS`. Production requires explicit trusted origins and `NODE_ENV=production` for Secure cookies.

Sessions use the existing API's HttpOnly cookies, which may be shared with the web app. The extension never stores passwords or raw session tokens. Closing the popup clears its account profile; reopening checks the server session. A failed server logout remains visible and should be retried.

Vault keys and decrypted credentials remain in a dedicated crypto worker hosted by an offscreen extension document. Closing the popup drops its rendering copies but keeps the shared vault unlocked by default. Settings offer five-minute inactivity (default), fifteen-minute inactivity, or popup-close locking, always capped at one hour and authenticated session expiry. Browser restart, extension reload, owner destruction, logout, and manual lock clear the key. No secrets go into persistent or session storage. Service-worker suspension does not require another unlock. Unlocking verifies every encrypted entry before accepting the key; empty vaults remain locked until the first credential is created in the web app. No database migration is needed. Shared crypto/schema packages require running npm install after upgrading to Phase 3.

Phase 4 needs only a rebuild and extension reload. Copying is explicit and requires a focused popup; copied values can remain in the device clipboard after locking. Website opening does not send credential fields to the website. No additional permissions or backend changes are needed.

Development defaults to `http://localhost:3001`. Production requires an HTTPS `VITE_API_ORIGIN` in `.env.production.local`, then `npm run extension:build`. Environment values are public build configuration, never secrets.

For Phases 6–8, restart the API (optional account and conditional-update guards), rebuild, and reload the extension manifest. Later Phases 9?10 add offscreen, storage (nonsecret settings/target metadata only), and contextMenus. Mandatory host access remains API-only; page buttons use optional exact-host grants. Fill login works only on matching HTTPS top-level supported forms and never submits. Multiple login forms require a choice.

Save credentials contains manual Add credential and opt-in Watch submission/Review capture. An armed watch may briefly outlive popup closure; only an encrypted capture and a separate ephemeral key live in worker memory for at most two minutes. A badge indicates delivery. Reopen from the same tab/origin, unlock, review, and confirm a new save or explicitly selected account password update. Manual lock/logout/discard, expiry, and worker restart discard pending captures. Worker suspension and classic navigation before delivery can lose a capture: manually add it instead. No capture is automatically saved or taken as proof of a successful login. The vault follows the configured Phase 9 locking policy.

Phase 5 adds only the activeTab permission. Rebuild and reload the extension, then invoke it from the toolbar on a website to grant temporary URL access. Matching uses exact HTTPS hostname/port; subdomains are not implicitly trusted. Ordinary popup.html tabs do not grant website access. No API restart is needed for Phases 9?10; the configured locking policy now determines behavior after closing.

```powershell
npm run typecheck --workspace=extension
npm run extension:test
npm exec --workspace=extension -- playwright install chromium
npm run test:browser --workspace=extension
```

After the Phase 9?10 upgrade, rebuild and reload the unpacked extension manifest. Unlock once, close the popup, then press **Alt+Shift+L** or right-click a supported HTTPS login form and choose **Fill with Password Manager**. Select the account in the extension-owned window; filling never submits. A request expires after two minutes or when its target changes. Configure shortcut conflicts at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

To show a button on a website, open popup **Settings** on that site and choose **Enable page button for this website**, then approve the browser's exact-host permission request. No website receives passive access by default. Disable from Settings to remove controls and revoke optional access. `www` and apex hosts remain separate, and matching includes the HTTPS port. The floating button opens the same trusted chooser; it never asks for the vault password on the page.

Browser tests require the default development build. UI tests use mocked responses; cookie/lifecycle tests build a separate bundle against a real loopback Hono fixture. All use isolated Chromium profiles without Neon or email calls. Manual Chrome/Edge toolbar checks remain necessary.

See [Phase 9](../../spec/extension-phase-09-longer-unlock-sessions.md) and [Phase 10](../../spec/extension-phase-10-fill-without-popup.md) for lifecycle, permissions, and manual checks. See [Phase 6](../../spec/extension-phase-06-secure-autofill.md), [Phase 7](../../spec/extension-phase-07-password-generator.md), and [Phase 8](../../spec/extension-phase-08-save-credentials.md) for behavior, boundaries, limitations, and tests. Earlier phase specifications and [the roadmap](../../spec/extension-roadmap.md) cover matching, browsing, authentication, and key compatibility.
