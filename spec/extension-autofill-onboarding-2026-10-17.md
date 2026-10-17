# First-login autofill setup

Status: implemented. A setup card appears inside the extension popup when a
verified account first signs in on an installation with no previous autofill
choice. It also appears when the first popup opening restores a verified session.
Unverified and signed-out accounts do not see it.

## User flow

1. Sign in and complete registration email verification if needed.
2. The **Set up autofill** card explains field suggestions and HTTPS website access.
3. Choose **Enable autofill on all HTTPS websites** and approve the browser's
   permission request. The existing background handler checks the real permission,
   saves the global preference and registers/injects the existing content script.
4. Unlock the vault. Clicking a supported login field offers matching accounts;
   selecting one fills the form. Forms are never submitted automatically.

No browser permission request happens on login/render alone. Chrome requires
optional permission requests to originate from a user gesture; see the
[Chrome permissions documentation](https://developer.chrome.com/docs/extensions/reference/api/permissions).
The card is an inline, accessible region rather than a blocking modal, so unlocking
and the existing shortcut/popup flows remain available if access is declined.

**Not now** stores only `autofillSetupDismissed: true` in local extension settings.
It prevents repeated onboarding on future popup openings or sign-ins on that
installation. It does not grant permissions or enable suggestions. Settings still
offers the global switch and individual-site access. Browser denial shows a clear
retry/Settings message and leaves all preferences unchanged until an explicit
choice; opening the browser prompt is never treated as consent.

An existing `inlineAllSites` boolean (including explicit false) or nonempty
`inlineOrigins` preference suppresses onboarding. Existing site-only choices and
disabled suggestions are respected. Successful setup already persists the global
preference, so no second dismissal flag is necessary. These are installation-wide
settings, consistent with the existing permission model, not account identifiers.

## Implementation

- `apps/extension/src/popup/AutofillOnboarding.tsx`: explanation, enable/skip,
  errors, duplicate-click guard and unmount handling.
- `apps/extension/src/popup/auth/AccountPanel.tsx`: renders only for a verified
  signed-in account, above the vault unlock UI.
- Reuses `inline/all-sites` and `ALL_HTTPS_SITES`; no new background API,
  permissions, secret storage, vault unlock policy, or API/database changes.

## Testing

```powershell
npm run test --workspace=extension
npm run build:dev --workspace=extension
npm run test:browser --workspace=extension -- tests/browser/auth.spec.ts
```

Authentication browser cases cover initial verified login, no browser prompt
without a click, denial without settings changes, skip persistence on reopening,
unverified restrictions, and existing global/site-only/disabled choices.
The global-suggestions interaction case now starts with the onboarding button,
verifies its requested permission, and exercises the real background checks,
script registration, filling on matching sites, isolation on another site,
popup reload persistence and disabling suggestions.

Validation passed: all 354 unit tests, 11 authentication browser tests and the
updated end-to-end global-suggestions browser case. Extension TypeScript and
development build passed. Native permission dialogs still need the manual checks
below; the automated acceptance path uses the fixture's real pre-granted permission.

Headless tests simulate the native prompt response; a test-only manifest grants
global access in the existing interaction fixture. Production mandatory host
permissions remain limited to the API. Native Chrome/Edge approval remains manual:
reload the extension, sign in with fresh preferences, approve Enable, unlock,
visit a matching sign-in page and select an account from its field picker. Also
check browser denial, Not now, and enabling later through Settings.
