# Phase 10 — Filling without the toolbar popup

Status: implemented. Explicit account choice remains mandatory; nothing fills or
submits automatically when a login page loads.

## User flow

1. Unlock once in the extension (Phase 9 keeps the key in memory while UI closes).
2. Visit a supported HTTPS login form and press `Alt+Shift+L`, or right-click the
   page/input and choose **Fill with Password Manager**.
3. A small extension-owned window shows the exact destination origin and matching
   accounts. If locked, authentication and unlocking happen only in extension UI.
4. Choose the form when multiple supported forms exist, then explicitly choose
   the account. Only that username/password is delivered to the pinned document.
5. The chooser closes after successful filling; review and submit yourself.

Chrome/Edge shortcut conflicts can be configured on the Extensions shortcuts
page. Invocation on restricted pages or unsupported forms safely does nothing.
The chooser expires after two minutes; invoke it again if its target changes.

## Optional page button

In popup Settings while on a website, choose **Enable page button for this
website**. Chrome prompts for that exact HTTPS hostname. A local isolated-world
content script adds a compact **Fill with Password Manager** control when visible
password fields in forms appear. It also observes dynamically rendered forms.

The button opens the extension-owned chooser. It never reads saved credentials,
displays account names, asks for the vault password on the website, or requests
direct delivery. There are no mandatory broad website host permissions.
`optional_host_permissions` declares `https://*/*` only as the universe of possible
grants; the extension requests/registers exact-host patterns one at a time.
No wildcard subdomains are requested. Chrome host patterns cannot restrict ports;
credential matching and delivery still enforce exact HTTPS origin including port.

Disable the button in Settings to remove live controls and future registrations,
and revoke the optional host grant. Required API host access cannot be removed.
Removing permission through browser controls stops future injection and delivery;
an already present inert control can remain until reload. Shadow DOM styling is
UI isolation, not a security boundary against a malicious website.

## Architecture and boundaries

- `src/background/quickFill.ts`: prepares a top-frame form probe, pins tab/window,
  origin/document/signatures, opens the chooser, and revalidates before delivery.
- `fill.html`, `src/fill/main.tsx`: trusted extension-owned authentication/unlock
  and account/form selection; reuses existing UI and the shared session client.
- `src/content/inline.ts`: optional classic isolated script with no imports,
  remote code, page messages, secret attributes, or credential cache.
- `src/background/inlinePermissions.ts`: exact-host permission patterns and
  dynamic content-script registration only for explicitly enabled origins.
- `src/popup/UnlockSettings.tsx`: session settings and per-site permission UI.

Shortcut/context-menu invocation uses the existing `activeTab` model. The optional
page control uses its explicit host grant. Neither needs a mandatory `tabs` or
all-websites host grant. `contextMenus` is new; `commands` is a manifest entry,
not a general permission. Iframes cannot invoke page-button filling.

The content-script caller is authenticated with browser-provided extension ID,
top-frame ID, tab/document identity, origin, and granted/enabled site. That caller
can only ask to open a chooser. The fill protocol accepts only the exact chooser
URL in its bound UI tab. Content scripts cannot access the API broker, full vault,
vault key, or selected-credential endpoint.

The background receives only the selected credential after a fresh server-session
check. It verifies saved Website against the pinned HTTPS origin, source tab still
active in its original window, URL, expiry, current ticket, form choice, and exact
document ID. Delivery executes the existing Phase 6 isolated `formOperation`,
which rechecks origin/visibility/action/field signature and never submits. There
is no fallback to a new document after navigation.

One chooser ticket is stored in `chrome.storage.session` with trusted-context
access only. It contains a random request ID, browser tab/window/document IDs,
origin, expiry, and nonsecret form descriptors. It contains no credential, key,
password, or token. This enables background-worker restart without retaining
secrets. A newer chooser replaces the old ticket; consumption prevents replay,
and concurrent selection requests cannot both deliver.
Closing/cancelling the chooser or closing its source tab also invalidates the
ticket. The chooser tab is checked again after server authorization, so a delayed
reply cannot deliver after cancellation.

Known Phase 6 limitations remain: top-level forms with visible identifiable
username/email and a single current-password field; no iframe filling, shadow-root
forms, username-only/password-only steps, automatic submission, or broad inferred
subdomain trust. Page-controlled login code necessarily can read fields you choose
to fill; exact-origin matching does not make a compromised legitimate site safe.

## Tests and manual checks

```powershell
npm run build:dev --workspace=extension
npm run test --workspace=extension
npm run test:browser --workspace=extension
```

Unit cases reject phishing suffixes, HTTP, unrelated subdomains/ports, inactive
tabs, wrong UI callers, expired/replayed tickets, iframe results, stale documents,
missing credentials, and navigation during server authorization. They verify
selected-only delivery and nonsecret ticket reuse after worker replacement.

Packaged browser fixtures exercise opt-in/dynamic page controls, chooser unlocking
without entering secrets on the page, popup-closed filling, multiple accounts,
no automatic fill/submit, stale-document rejection, forged content requests,
disable cleanup, and registered keyboard binding. Playwright's page keyboard
events do not exercise the native browser accelerator; actual shortcut and
context-menu invocation remain manual checks. Fixtures use public encrypted sample
credentials, mock APIs, and isolated profiles; no real vault is accessed.

Manually check native Chrome/Edge permission prompts, context-menu invocation,
shortcut assignment/conflicts, enabling/disabling a real third-party hostname,
source tab changes and iframe attempts. The optional page control is a small
floating button near the bottom right, not an account menu embedded in page inputs.

## Validation record — 2026-10-11

- Extension unit suite: 245 passed across 13 files.
- Complete Chromium browser suite: 46 passed in one run, including the real
  cookie/privacy fixtures and all seven new chooser/permission cases.
- Development/production bundles and extension TypeScript check passed.
- The expanded field-visibility regression passed separately after the final
  inline observer fix. Native browser shortcut invocation and permission prompts
  remain manual checks; the automated test verifies registered shortcut binding.
- No backend changes or new dependencies were needed for Phases 9–10.

## References

- [Offscreen worker hosts](https://developer.chrome.com/docs/extensions/reference/api/offscreen)
- [Commands](https://developer.chrome.com/docs/extensions/reference/api/commands)
- [activeTab user gestures](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab)
- [Optional permissions](https://developer.chrome.com/docs/extensions/reference/api/permissions)
- [Dynamic content scripts](https://developer.chrome.com/docs/extensions/reference/api/scripting)
