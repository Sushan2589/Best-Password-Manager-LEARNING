# Phase 05: Website detection and matching

Status: implemented. Phase 6 requires confirmation.

## Scope

The unlocked popup reads the active tab in its current window after explicit extension invocation using `activeTab`. URLs are parsed with `URL`; matching requires HTTPS and equal normalized origins (exact ASCII hostname and effective port). Paths, query strings, and fragments do not determine host identity. Default port 443 is normalized by URL parsing. Neither `www` nor trailing dots are stripped, and parent domains/subdomains are never inferred as trusted. Any additional trusted host needs an explicit future design.

The Current website card displays the normalized origin only; page paths, queries, fragments, titles, and favicons are not retained. Eligible sites default to the This site filter, including multiple accounts and a no-matches state. All credentials remains explicitly available, with metadata search within the chosen filter. HTTP, restricted pages, missing URLs/permissions, and failed queries explain the limitation and preserve ordinary all-vault browsing without suggesting a site match. IDNs are displayed as ASCII/punycode to avoid rendering a Unicode lookalike as a trusted hostname.

No substring, suffix-only, or visual similarity comparisons authorize a match. Unsafe schemes, URL userinfo, whitespace/control characters, and malformed addresses fail closed through the Phase 4 URL validator. Bare domain text is not automatically interpreted as HTTPS; saved websites must be absolute URLs.

## Permissions and lifecycle

The only new permission is `activeTab`. There is no broad `tabs`, `scripting`, `<all_urls>`, or new host permission. Chrome grants temporary access when the user invokes the extension action; opening popup.html as an ordinary tab does not grant access to unrelated website URLs. The existing API-only host permission can also expose URLs for that configured host, as before. Chrome revokes the temporary grant on cross-origin navigation; unavailable URL data is treated as unavailable, never recovered using a previous cached origin.

The popup calls chrome.tabs.query directly. No new worker message, content script, backend endpoint, database migration, dependency, storage, or crypto change is needed. Website origins and credential metadata remain popup-local and never go to the backend. Matching never transmits credentials to a page. This phase does not inspect iframes, inject scripts, fill forms, or submit anything.

Active-tab activation, navigation updates, removal, and popup focus trigger a fresh query. Each refresh invalidates the previous site before awaiting its result. A loading tab has no usable match. Request generations discard out-of-order responses, and disposing the popup observer removes listeners and rejects late results. Changing the site state discards an open detail view, including any revealed password. Locking/unmounting discards the observer and filter state. A new popup still requires vault unlocking.

Matching is a browsing aid, not authorization to fill a form. Phase 6 must re-read the actual target tab, validate HTTPS origin/frame/tab identity immediately before sending a selected credential, and handle navigation races independently. The user's request to consider remaining unlocked across popup openings is deferred to a separate reviewed key lifecycle change.

## Implementation files

- `apps/extension/manifest.ts`: activeTab permission only.
- `src/popup/sites/matching.ts`: pure HTTPS exact-origin matching.
- `src/popup/sites/activeSite.ts`: sanitized active-site state and cancellable query observer.
- `src/popup/sites/useActiveSite.ts`: popup-only Chrome API/event integration.
- `src/popup/vault/CredentialBrowser.tsx`: current-site card, filters, no matches, and detail cleanup.
- Unit/browser site suites and updated manifest/clipboard regression assertions.

Source paths after the first entry are relative to apps/extension.

## Acceptance tests

| Saved site | Active site | Initial result |
| --- | --- | --- |
| `https://github.com` | `https://github.com/login` | Match |
| `https://google.com` | `https://accounts.google.com` | No match |
| `https://github.com` | `https://github.com.evil.com` | No match |
| `https://example.com` | `https://notexample.com` | No match |
| `https://example.com` | `http://example.com` | No match |
| `https://example.com` | `https://example.com:8443` | No match |

Additional unit cases cover explicit matching subdomains, www, trailing dots, nondefault ports, IDN/punycode equivalence, Unicode lookalikes, unsafe URLs, HTTP on both sides, path/query removal, tab loading/unavailable states, query failures, disposal, and stale-query rejection.

Packaged browser tests cover current-site filtering with multiple accounts/search, explicit all-vault browsing, navigation clearing a revealed password, phishing and port mismatches, separate parent/subdomain matches, HTTP and missing URL explanations, and the real Chrome tabs API withholding an unrelated HTTPS URL without a user invocation grant. Positive-site UI tests simulate the tab API because automated popup pages are ordinary tabs rather than native toolbar popups. They do not claim to exercise Chrome's native action-grant path; that remains the manual check below. Other API/vault flows use encrypted public fixtures, not live credentials.

## Validation record — 2026-10-11

- 160 unit tests passed, including 29 new matching/tab lifecycle cases and the disposed-observer callback check.
- The complete 28-test packaged browser suite passed, including earlier authentication, cookie, vault, and browsing regressions. After the final filter styling and observer disposal guard, all 10 credential/site browser tests passed again against the final development build.
- TypeScript checks and development/production builds passed. The HTTPS production fixture build used a separate ignored output directory; dist remains configured for the existing local API.
- Reviewed the current-site screenshot, including the visible selected-filter accent and compact controls.
- Manifest inspection confirms activeTab is the sole general permission, with unchanged API-only host access and no content scripts. Matching code contains no fetch, console logging, persistent storage, or page messaging.
- `git diff --check` passed. Existing Zod/Rollup annotation warnings remain nonblocking.

The native Chrome/Edge toolbar grant path remains a manual check, as described below.

## Testing instructions

```powershell
npm run build:dev --workspace=extension
npm run extension:test
npm run test:browser --workspace=extension
```

Reload the unpacked extension at chrome://extensions or edge://extensions to apply its updated manifest. No API restart or npm install is required.

1. Save two web credentials with `https://github.com` URLs. Visit https://github.com/login, invoke the extension from its toolbar button, and unlock. Confirm the displayed origin and both This site matches.
2. Search within This site, switch to All credentials, and return. Confirm no-match sites do not show unrelated credentials in This site.
3. Visit a separate subdomain such as accounts.google.com: only credentials explicitly saved for that hostname should match. A credential saved for google.com must not match.
4. Check an HTTP page and a restricted browser page. The popup should explain why matching is unavailable and still offer normal vault browsing.
5. Reveal a password, close the popup, and reopen from a different site. Confirm the vault is locked and the newly unlocked list uses the current site.
6. Check equivalent default ports and differing explicit ports using a local HTTPS fixture if needed. Avoid visiting real phishing domains; automated fixtures cover those cases.

References: [Chrome activeTab grants and revocation](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab), [Tabs API permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs).
