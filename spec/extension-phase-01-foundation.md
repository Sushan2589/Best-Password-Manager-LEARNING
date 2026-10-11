# Phase 01: Extension foundation

Status: implemented and automated checks passed. Awaiting manual Chrome/Edge review and user confirmation before Phase 2.

## Delivered

- `apps/extension` npm workspace with React, TypeScript, Vite, Tailwind CSS, and Lucide.
- A 400px popup capped at 600px height, with scrolling for overflow, the existing warm background, white cards, navy text, and `#c45b48` accent. Vault, generator, and settings screens clearly indicate unavailable future functionality. No fake credentials or working-looking login form.
- Loading, connection failure, retry, and locked/empty states with accessible navigation and status announcements.
- Module background service worker with synchronous message-handler registration and no cached sensitive state.
- Explicit read-only connection check against existing `GET /user/me`. JSON HTTP 200/401/403 indicates a reachable API; neither profile data nor raw response/errors are sent to the popup. This is not proof that extension login works or email is verified.
- Eight-second request timeout, no-store requests, cookies included, redirects rejected, and a fixed API destination.
- Strict messaging authorization using browser-provided extension ID and exact packaged popup URL. Foreign senders, website/content-script senders, unknown message types, and URL-bearing requests are rejected without network access. The same packaged popup can be opened as an extension tab for automated tests.
- Generated `dist/manifest.json` with only the configured API host permission. No `cookies`, `storage`, `tabs`, `activeTab`, `scripting`, `<all_urls>`, content scripts, or external messaging.
- CSP permits packaged scripts/styles and only the configured API network origin. No eval, remote executable code, WebAssembly, or remote images/fonts. WebAssembly permissions will be reviewed when crypto is introduced.
- Development watched builds use packaged assets; no Vite development server or CSP relaxation is needed.
- Development allows HTTP loopback only. Production builds require an explicit HTTPS API origin. Credentials, paths, queries, and fragments are rejected in origin configuration.
- Root workspace support for future `packages/*` and extension convenience scripts.

Chrome host permission patterns do not restrict ports. `connect-src` and the runtime's fixed origin enforce the configured port. Build environment values are public configuration, never secrets.

## Files and boundaries

- `vite.config.ts` and `manifest.ts`: packaging, configuration validation, and manifest generation.
- `src/config/`: API-origin validation and build-injected runtime configuration.
- `src/api/`: read-only API connectivity transport.
- `src/background/`: worker registration and message authorization.
- `src/messaging/`: request/response protocol and runtime guards.
- `src/popup/`: React interface, styling, and messaging client.
- `tests/unit/`: origin restrictions, manifest privileges, transport failures/timeouts, response sanitization, and unauthorized requests.
- `tests/browser/`: packaged Chromium loading, navigation, actual worker messaging, connection states, and popup-page reopening.

Authentication, vault decryption, autofill, editable settings, and generation are future phases. The backend and web application have not been rewritten.

## Development and testing

Run commands from the repository root. On PowerShell systems that block `npm.ps1`, use `npm.cmd` in place of `npm`.

```powershell
npm install
npm run build:dev --workspace=extension
npm run test --workspace=extension
npm run typecheck --workspace=extension
npm exec --workspace=extension -- playwright install chromium
npm run test:browser --workspace=extension
```

Browser tests expect a development build using the default `http://localhost:3001`. They mock the API and do not use the database or send emails. Playwright uses its bundled Chromium because current Chrome/Edge distribution builds do not reliably support command-line extension loading.

Load the unpacked extension:

1. Open `chrome://extensions` in Chrome or `edge://extensions` in Edge.
2. Enable Developer mode and choose **Load unpacked**.
3. Select `apps/extension/dist`, not the source directory.
4. Pin Password Manager and open its popup. Confirm the 400px interface, disabled sign-in, generator placeholder, and locking information.
5. Click **Check connection**. A running API should report reachable, including when it returns 401. With the API stopped, expect an error and retry control.
6. Check the extension's Errors panel and popup console for CSP/runtime errors. No account data or response contents should be logged.
7. Close and reopen the popup. Connection state should reset, and the vault should remain locked.

For ongoing development:

```powershell
npm run extension:dev
```

Reload the extension after a rebuild, then reopen the popup. Manifest/environment changes may require restarting the watcher.

For production, create `apps/extension/.env.production.local` with the actual origin:

```dotenv
VITE_API_ORIGIN=https://api.your-domain.example
```

Then run `npm run extension:build`. Do not copy the development HTTP origin into production. The generated output is an unpacked bundle, not a published store release.

## Validation record

- Extension TypeScript passed, as did existing web and API TypeScript checks.
- Development unpacked build passed. Production build passed with an example HTTPS origin in separate ignored test output; no deployment or API requests used that example origin.
- 34 Vitest tests passed, covering origin restrictions, manifest permissions, sanitized responses, timeout/error handling, unauthorized senders, and malformed messages/responses.
- Three Playwright tests passed in isolated bundled Chromium: strict-CSP popup loading/navigation/size, loading and sanitized API reachability through the worker, and network failure/retry with popup-page reopening.
- Visual review used a generated popup screenshot. Test screenshots/output are ignored artifacts.
- Extension source contains no console calls, localStorage/IndexedDB/extension-storage writes, eval, or window.postMessage.
- `git diff --check` passed.
- Dependency installation reported a `source-map-js` build-tool advisory. A targeted update from 1.2.1 to 1.2.2 within existing allowed ranges resolved it; npm reported zero remaining vulnerabilities afterward. No blanket audit fix or application dependency upgrade was performed.

Manual Chrome/Edge toolbar loading is not yet performed. Opening `popup.html` as a test page does not exercise toolbar dismissal. Actual cookie login, extension reload, worker suspension, and vault-key lifecycle tests belong to subsequent phases; Phase 1 creates no vault key or authenticated-profile cache. No live database/email scripts or migrations were run.

## Next checkpoint

Obtain user confirmation before Phase 2. Cookie integration and backend changes must be tested and explained before implementation expands.
