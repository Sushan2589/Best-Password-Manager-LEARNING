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

Vault keys and decrypted credentials remain in a dedicated crypto worker hosted by an offscreen extension document. Closing the popup drops its rendering copies but keeps the shared vault unlocked by default. Settings offer fifteen-minute inactivity (default), five or thirty minutes, popup-close locking, or **Until browser closes**. Timed policies are capped at one hour; browser-session mode has no local inactivity/one-hour timer. Authenticated session expiry still applies to every policy. Closing all normal browser windows, browser restart, extension reload, owner destruction, logout, and manual lock clear the key. No secrets go into persistent or session storage. Service-worker suspension does not require another unlock. Unlocking verifies every encrypted entry before accepting the key; empty vaults remain locked until the first credential is created in the web app. No database migration is needed. Shared crypto/schema packages require running npm install after upgrading to Phase 3.

Phase 4 needs only a rebuild and extension reload. Copying is explicit and requires a focused popup; copied values can remain in the device clipboard after locking. Website opening does not send credential fields to the website. No additional permissions or backend changes are needed.

Development defaults to `http://localhost:3001`. For Vercel Services, set `VITE_API_ORIGIN=https://passwordmanager.sushandahal.com.np/api` in `.env.production.local`, then run `npm run extension:build`. An HTTPS origin without `/api` is still supported for standalone API hosting. Environment values are public build configuration, never secrets. See the root [deployment guide](../../DEPLOYMENT.md) for the API's extension-origin allowlist.

For Phases 6–8, restart the API (optional account and conditional-update guards), rebuild, and reload the extension manifest. Later Phases 9?10 add offscreen, storage (nonsecret settings/target metadata only), and contextMenus. Mandatory host access remains API-only; field suggestions use optional exact-host grants. Fill login works only on matching HTTPS top-level supported forms and never submits. Multiple login forms require a choice.

Save credentials contains manual Add credential and opt-in Watch submission/Review capture. An armed watch may briefly outlive popup closure; only an encrypted capture and a separate ephemeral key live in worker memory for at most two minutes. A badge indicates delivery. Reopen from the same tab/origin, unlock, review, and confirm a new save or explicitly selected account password update. Manual lock/logout/discard, expiry, and worker restart discard pending captures. Worker suspension and classic navigation before delivery can lose a capture: manually add it instead. No capture is automatically saved or taken as proof of a successful login. The vault follows the configured Phase 9 locking policy.

Phase 5 adds only the activeTab permission. Rebuild and reload the extension, then invoke it from the toolbar on a website to grant temporary URL access. Matching uses exact HTTPS hostname/port; subdomains are not implicitly trusted. Ordinary popup.html tabs do not grant website access. No API restart is needed for Phases 9?10; the configured locking policy now determines behavior after closing.

```powershell
npm run typecheck --workspace=extension
npm run extension:test
npm exec --workspace=extension -- playwright install chromium
npm run test:browser --workspace=extension
```

After the Phase 9?10 upgrade, rebuild and reload the unpacked extension manifest. Unlock once, close the popup, then press **Alt+Shift+L** or right-click a supported HTTPS login form and choose **Fill with Password Manager**. Select the account in the extension-owned window; filling never submits. A request expires after two minutes or when its target changes. Configure shortcut conflicts at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`.

For Phase 11 field suggestions, open popup **Settings** on the website and choose **Enable suggestions for this website**, then approve the browser's exact-host permission request. Click a supported username/email or password field to see matching accounts directly below it. Selecting an account fills both login fields and dismisses the picker without submitting. The picker runs in an extension-owned iframe; account metadata is unavailable to the website DOM. A locked vault opens a separate extension unlock window. Disable suggestions in Settings to remove controls and revoke optional access. Existing Phase 10 opt-ins carry over. `www` and apex hosts remain separate, and matching includes the HTTPS port. Alt+Shift+L keeps working without permanent host access and prioritizes the focused login form. Rebuild, reload the extension, and refresh open login pages after upgrading. See [Phase 11](../../spec/extension-phase-11-field-suggestions.md).

Browser tests require the default development build. UI tests use mocked responses; cookie/lifecycle tests build a separate bundle against a real loopback Hono fixture. All use isolated Chromium profiles without Neon or email calls. Manual Chrome/Edge toolbar checks remain necessary.

For read-only checks of current public login pages in installed Chrome and Edge:

```powershell
npm run test:sites --workspace=extension
```

This optional command contacts the named public websites, probes their top-document
forms in an isolated browser world and writes `test-results/live-site-probes.json`.
It uses temporary signed-out browser contexts, does not load the extension, and
never fills fields or submits accounts. It is not part of offline CI and does not
prove native permission handling or authenticated multi-step compatibility.
See [the release usability review](../../spec/extension-release-review-2026-10-18.md)
for executed results and the remaining real-account/Chrome/Edge sign-off checklist.

See [Phase 9](../../spec/extension-phase-09-longer-unlock-sessions.md) and [Phase 10](../../spec/extension-phase-10-fill-without-popup.md) for lifecycle, permissions, and manual checks. See [Phase 6](../../spec/extension-phase-06-secure-autofill.md), [Phase 7](../../spec/extension-phase-07-password-generator.md), and [Phase 8](../../spec/extension-phase-08-save-credentials.md) for behavior, boundaries, limitations, and tests. Earlier phase specifications and [the roadmap](../../spec/extension-roadmap.md) cover matching, browsing, authentication, and key compatibility.

For one-time setup across websites, reload the extension and open Settings ? **Enable suggestions on all HTTPS websites**. Approve the browser permission once. Supported HTTPS login pages then show suggestions without individual site setup. This grants broader form-detection access; exact origin/port matching and explicit account selection still apply. Site-only setup remains available. Form compatibility is separate from broad website permission; see Phase 13 for supported multi-step forms. See [Phase 12](../../spec/extension-phase-12-global-suggestions.md).


Phase 13 adds explicit encrypted login-address approvals. Saving `https://google.com` can offer approval for `https://accounts.google.com`; exact apex/`www` pairs can also be reviewed. Approval does not trust other subdomains or automatically fill. Open the popup or Alt+Shift+L chooser, verify both addresses, confirm, then select the account. Remove an approval from credential details. Supported username-only and current-password-only form steps require a fresh selection on each step; Next and submission remain manual. If website access is missing, the extension UI offers an exact-host permission prompt. See [Phase 13](../../spec/extension-phase-13-login-origins-and-multistep.md) and [the full testing checklist](../../spec/extension-testing-checklist.md). Rebuild, reload the extension and refresh open login pages; no backend restart or database migration is needed for this phase.

Google sign-in detection now handles hidden password helpers and form controls named `action`. Login-origin approval is available inside credential details too. See [the Google form fix](../../spec/extension-fix-google-form-detection.md) for live-page validation and reload steps.

Phase 14 adds generic detection for form-less login widgets, accessible labels and open shadow roots. The shared detector handles combined autocomplete tokens such as `username webauthn`, including modern Google sign-in. No provider-specific field selectors were added. See [Phase 14](../../spec/extension-phase-14-generic-login-detection.md). Closed shadow roots, iframe logins and ambiguous custom markup remain unsupported.
