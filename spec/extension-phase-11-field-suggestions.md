# Phase 11 — Suggestions attached to login fields

Follow-up: [React-controlled autofill fix](extension-fix-react-controlled-autofill.md) records the Vidya Nepal partial-fill bug, its correction, and live-page verification.

## What changed

Replaced the floating page button with a compact account picker anchored below the focused username/email or password field. It uses the existing warm white palette and terracotta accent, displays account title and username, supports multiple accounts, and adjusts its position on scrolling/resizing. Clicking an account fills **both username/email and password in the chosen login form**. It never submits the form or fills other forms.

Alt+Shift+L and the context-menu action remain available. Their separate extension window now prioritizes the form containing the focused username/password input. Where several supported forms exist, the user can still select a form explicitly. A shortcut does not require a permanent website grant; Chrome grants temporary activeTab access when the native command is invoked.

## Enable and test manually

1. Run `npm run build:dev --workspace=extension`, reload the unpacked extension, and refresh any previously open login pages.
2. Unlock the vault. On the intended HTTPS website, open popup Settings and choose **Enable suggestions for this website**. Approve Chrome/Edge's permission request for that hostname. Existing Phase 10 enabled sites carry over automatically.
3. Close the popup and click a supported username/email or current-password field. Choose the desired saved account. Both fields of that form should fill; the form should remain unsubmitted.
4. Test two login forms: click the password field in the second form and choose an account. The first form must remain empty.
5. Focus a login field, press Alt+Shift+L, and select an account. The focused form should be listed first and both of its fields should fill.
6. Lock the vault, then click a login field. **Unlock in Password Manager** opens a separate trusted extension window. Enter the vault password there, then select the account.
7. Disable website suggestions in Settings. The picker must disappear and must not reappear after page reload.

The picker supports pointer selection, Tab, arrow keys within the picker, ArrowDown from the field into the picker, and Escape. Clicking another page control dismisses it. Successful filling dismisses it. Dynamic forms are handled through delegated focus/click listeners rather than scanning only at page load.

## Architecture and security

- `src/content/inline.ts` positions a closed-shadow host containing a cross-origin extension iframe. The closed shadow is for UI isolation; it is **not a security boundary**.
- `suggestions.html` and `src/suggestions/` render account rows inside the extension origin. Website JavaScript cannot read their DOM through the same-origin boundary. There are no account names, usernames, passwords, or vault keys in page-accessible picker DOM attributes, and no window.postMessage channel.
- `src/background/suggestions.ts` issues a random two-minute ticket only to the enabled site's top-level isolated content script, after proving a supported login field is focused. It binds the ticket to the tab, HTTPS origin including port, parent document, and form signature.
- Only the exact packaged suggestion iframe URL in that tab can view matching account metadata or select an account. The first iframe document binds the ticket, and subsequent messages from another iframe document are rejected. Arbitrary content scripts cannot invoke the metadata/selection operations or access session/view, session/entry, or owner/api.
- The iframe receives only matching account ID/title/username metadata. It never receives passwords, a vault key, or unrelated vault entries. Clicking an account must be a trusted browser event; synthetic clicks are ignored.
- Selection consumes the ticket, requests one credential through the existing session owner with fresh server authorization, checks exact website matching again, and injects the existing isolated form-filling function into the pinned parent document. It revalidates document/form/origin rather than falling back after navigation.
- Manual lock/logout, grant revocation, replacement picker, changed form, changed tab/origin, expired ticket, and worker replacement prevent delivery. In-flight selection cannot revive a ticket cleared by manual lock/logout.
- No new backend changes, crypto changes, dependencies, mandatory permissions, plaintext logging, or secret persistence were introduced. Nonsecret existing website opt-ins remain in local storage. Picker tickets live only in background memory and are lost safely on service-worker suspension.

## Manifest changes and tradeoffs

The picker HTML/JS, its CSS, and Vite's small module-preload helper are the only newly web-accessible files. Popup, fill window, offscreen host, background script, and crypto worker remain outside the web-accessible allowlist. Optional website permissions remain exact-host grants; declaring an embeddable resource for HTTPS websites does **not** grant access to those websites.

The extension page CSP changes frame-ancestors from none to HTTPS to permit the picker iframe. Browser resource accessibility still blocks embedding the other extension HTML documents. A guessed or directly embedded picker without a valid target-bound ticket receives no account data. No remote scripts or unsafe eval are allowed.

The website can observe that a picker exists and its dimensions. As with any fill operation, the target website can read values entered into its own login fields after explicit selection. Origin matching prevents release to a different hostname/port; it cannot make a compromised website on an authorized origin trustworthy.

Some websites block extension iframes through their own frame-src CSP or cover overlays with top-layer elements. The shortcut/context-menu window remains the fallback. Supported forms retain the existing conservative requirements: top-level HTTPS, same-origin action, one visible account field and one current-password field. Formless widgets, shadow-root inputs, iframe logins, signup/change-password forms, and multi-step logins remain unsupported. This change fills the login pair, not arbitrary personal-data fields.

## Verification

Validation passed: 260 unit tests across 14 files, 49 Chromium browser tests in the full suite, TypeScript checking, development build, production HTTPS build, and git diff whitespace checks. After the final ticket-race guards and resource-allowlist assertions, the affected 49 unit tests were rerun successfully. Browser tests cover field focus with popup closed, dynamic forms, locked-vault handoff, multiple accounts, both fields in the focused second form, unrelated forms left untouched, metadata isolation, fabricated clicks, navigation, disabled grants, and existing save/capture behavior. Unit tests exercise message identity, wrong frames/tabs/origins, revoked grants, worker replacement, and lock during authorization.

Native Chrome/Edge shortcut invocation and permission prompts still require the manual steps above; headless keyboard events do not invoke Chrome's native shortcut layer.

References: [Chrome content scripts and shared DOM](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts), [web-accessible resources](https://developer.chrome.com/docs/extensions/reference/manifest/web-accessible-resources), [extension CSP](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy).
