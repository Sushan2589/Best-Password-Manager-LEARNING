# Phase 12 — One-time setup for automatic website suggestions

## Outcome

Settings now prominently offers **Enable suggestions on all HTTPS websites**. One browser permission approval enables field suggestions on future supported HTTPS login pages without per-site setup. Site-only setup remains an alternative. Existing site opt-ins remain compatible until the user disables automatic suggestions, which clears the suggestion opt-ins and unregisters page scripts.

Website access cannot be granted silently. Chrome requires an optional permission request from a user gesture; the button requests the already-declared optional `https://*/*` scope. No new mandatory host permissions are introduced. The tradeoff is broader form-detection access across HTTPS websites, instead of access to individual chosen hosts. Users can disable automatic suggestions in Settings or restrict access through the browser's extension site-access controls.

## Implementation

- `inlineAllSites` is a nonsecret local boolean. Keys, passwords, and decrypted credentials remain memory-only.
- `inlinePermissions.ts` registers one isolated top-frame content script for HTTPS pages after the broad grant is present. Without global setup, it retains the existing exact-host registrations.
- `inlineSiteAllowed()` centralizes global/site-only setting checks and verifies actual access to the target host. Withheld/revoked permissions still block operations.
- The trusted UI-only `inline/all-sites` command refuses to enable the feature without a granted broad permission. Enabling injects into existing allowed HTTPS tabs; registration covers future navigation. Disabling clears outstanding suggestion tickets, removes existing controls, unregisters scripts, and requests removal of the broad optional permission. The required API permission remains necessary for account access.
- If Chrome refuses permission removal (for example, required/managed grants), disabling still removes the controls and scripts and blocks suggestions through the setting. The Settings notice explains that website access must be adjusted in the browser. This fallback was exercised by the test-only mandatory-grant fixture.
- Existing encrypted-vault handling, exact HTTPS origin/port matching, document/form binding, extension-owned account picker, explicit credential selection, and no-submit behavior continue to apply.
- Broad permission does not trust arbitrary websites with arbitrary credentials. Each account must still match the current exact hostname and port, and only a selected credential is filled.

## Compatibility is separate from permission

Vidya Nepal's working form proves compatibility with that form, including its React-controlled inputs. It does not prove support for Google, Facebook, Instagram, LinkedIn, or every other site. No allowlist of supported brands is used: detection works generically on supported markup.

Current support remains one visible account input and one current-password input in a same-origin, top-level HTTPS form. Multi-step username-first/password-second flows, formless widgets, shadow-root inputs, iframe logins, signup/change-password forms, and ambiguous forms require further implementation and verification. Account matching also deliberately does not merge apex, www, and other subdomains implicitly. All-sites permission changes detection coverage, not those protections or form capabilities.

## Manual setup

1. Reload the rebuilt unpacked extension and refresh open login tabs.
2. Open Settings, choose **Enable suggestions on all HTTPS websites**, and approve Chrome/Edge's permission prompt once.
3. Unlock the vault, close the popup, and click a supported login input. Select an account to fill both fields without submission.
4. Visit another HTTPS website. It should show matching accounts without enabling that site individually; a site without matching accounts must show no matches.
5. Disable automatic suggestions. Existing pickers must disappear and future navigation must not inject them. Alt+Shift+L remains available through temporary activeTab permission.

## Verification

Unit tests cover global versus site-only selection, missing/withheld grants, HTTPS-only scope, global registration, revocation, and exact-account metadata filtering. Browser checks cover denied global setup, settings feedback, existing site-only behavior, real React-controlled forms, and private message boundaries.

The positive all-sites browser fixture grants broad access only in its generated test manifest because headless Chromium cannot approve Chrome's native optional-permission prompt. It exercises real global script registration on a second hostname and verifies that unrelated vault entries do not appear there. The production manifest keeps mandatory access limited to the API. Native optional permission approval/revocation remains a manual Chrome/Edge check.

Validation: 269 unit tests passed, including registration/revocation and global credential matching. Six affected existing browser checks passed (field focus, dynamic forms, disabling site controls, private message boundaries, and two real React regressions). The two new browser checks passed for denied permission/setup and positive cross-host global setup. TypeScript and the development build passed. The final expanded global test also passed checks for disabling, existing-control removal, future-page behavior, and API authentication remaining available.

Reference: [Chrome permissions API and user-gesture requirements](https://developer.chrome.com/docs/extensions/reference/api/permissions).
