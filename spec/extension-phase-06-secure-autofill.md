# Phase 06: Secure autofill

Status: implemented under the user's combined approval for Phases 6–8.

## Scope

Select a credential and press Fill login. Only matching HTTPS origins are eligible. The popup queries the active tab in its current window, checks the saved site's exact origin, and probes only frame 0. Chrome's returned documentId binds the eventual fill to that document. A single supported form fills from the explicit Fill action; multiple forms require selecting a numbered form. No supported forms produce a sanitized explanation.

Before releasing values, the popup revalidates the server session and the local vault generation, re-queries the active tab, checks tab ID/origin, and rereads only the chosen credential. The fill uses documentIds rather than a fresh frame ID: navigation to another document fails even if it stays on the same hostname. The injected packaged function runs in ISOLATED world and rechecks top frame, HTTPS origin, current visible fields, and form signature before writing. There is no fallback to a newly navigated document.

Architecture adjustment from the initial plan: the trusted popup coordinates Chrome scripting directly. The background worker continues its existing API role and never receives selected vault plaintext or the vault key. Content scripts cannot ask for vault data or initiate fills; there is no autofill message handler. Only the selected username (email fallback) and password cross into the bound form. No postMessage, DOM attributes, page scripts, remote executable code, eval, persistent content script, broad host access, or automatic submission is used.

Supported forms have exactly one visible writable password and exactly one identifiable username/email/text account field. New-password forms, multiple passwords, multiple ambiguous account fields, hidden/disabled/readonly fields, and cross-origin form actions/submitter overrides are refused. Forms added dynamically are discovered at click time. Native HTMLInputElement value setters plus input/change events support controlled inputs where those applications accept standard events.

For now, formless login widgets, shadow DOM, username-only first steps, password-only steps, iframes (including same-origin), unusual account field names, and applications requiring trusted keyboard events are unsupported. No form automatically submits, receives a forced focus, or gets clicked. Multiple-form choices are numbered in DOM order; the user identifies the intended form.

Once values are filled, the authorized website can read them. A compromised authorized page cannot be made safe by extension messaging; domain checks control delivery, not page behavior after filling.

## Acceptance tests

- Username/email/password inputs, multiple forms, hidden fields, signup/password-change forms, dynamic DOM, and controlled inputs.
- Only selected credentials delivered; no form submission.
- Phishing hosts, HTTP, unrelated frames/tabs, tab/document navigation races, and forged messages never receive secrets.
- Popup closure, worker restart, lock, and session expiration deny stale operations.

## Implementation and permissions

`content/forms.ts` contains the self-contained packaged probe/fill function. `popup/sites/autofill.ts` enforces the tab/document/session release boundary. `AutofillPanel.tsx` implements the explicit action/form choice. `VaultSession.authorizeAction` checks session identity and rejects stale operations after locking. Source paths are relative to apps/extension.

The manifest adds scripting beside activeTab. API-only host permissions remain unchanged; no tabs, storage, clipboard, webNavigation, or all-sites permissions were added. Chrome scripting document IDs are available within the existing minimum Chrome 120 support. [Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting).

## Testing and manual checks

```powershell
npm run build:dev --workspace=extension
npm run extension:test
npm run test:browser --workspace=extension
```

Reload the extension manifest, open a matching HTTPS login page, invoke the toolbar popup, unlock, select the account, and press Fill login. Check username/password values and confirm the page has not submitted. Repeat with multiple forms, dynamically inserted forms, new-password forms, hidden fields, and a changed tab or page. Unrelated sites and iframes must receive nothing. Native Chrome/Edge toolbar grants remain manual checks.

Automated tests use a separate packaged HTTPS fixture whose existing API host permission permits real isolated script execution, without broadening the production manifest. They exercise real document binding/navigation rejection, native input events, multiple/dynamic forms, hidden/new-password/action rejection, and untouched iframe fields. Unit tests verify no credential-bearing injection occurs for wrong schemes, phishing/subdomains, changed tabs, locked vaults, failed authorization, or rejected document targets.

## Validation record — 2026-10-11

Autofill boundary unit tests and all eight real packaged interaction tests passed, including document navigation rejection, dynamic/multiple forms, native events, untouched iframe fields, hidden/change/action rejection, and save/capture interactions. Extension TypeScript and development/production builds passed. The combined 201-unit/37-browser-case record and manual coverage limits are recorded in Phase 8.
