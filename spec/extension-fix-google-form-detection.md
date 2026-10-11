# Fix — Google sign-in form detection

## Reproduced cause

Inspected the public Google sign-in page through `https://accounts.google.com/ServiceLogin`, which redirected to the WebLite sign-in variant. The username form contains:

- A visible `identifierId` field with `autocomplete=username`.
- An invisible `hiddenPassword` input used by the page.
- A submit control named `action`, which shadows JavaScript's `form.action` property.
- A real, relative, same-origin `action` attribute.

The detector rejected the hidden password and interpreted the shadowed action property as a URL. The previous fixture covered a simple username-only form and missed both live-page differences.

## Changes

`content/forms.ts` now reads the actual form action attribute through the native `Element.prototype.getAttribute`, resolves it against the current URL, and uses the resolved address for both destination validation and the form signature. A control named `action` cannot bypass the cross-origin destination check.

A clearly identified username-only step can include hidden password inputs. Those inputs never become fill targets. Ambiguous text-only fragments, unmarked password-only steps, new-password forms and cross-origin actions still fail closed. The extension does not advance a login flow or submit a form.

The popup and background no longer treat a tab's general `loading` flag as sufficient reason to reject inspection/fill. Loading a child resource or the extension's picker iframe can set that flag on a usable page. Authorization still requires the exact origin, active tab, original top-level document and matching form signature; navigation/document failures remain rejected.

Credential details now offers the same explicit login-origin approval as the main credential list. Selecting Google from **All credentials** therefore lets the user approve `accounts.google.com` in place. Popup messages distinguish an unapproved address, unsupported fields and an inspection/access failure rather than combining all three into one generic error. Origin matching has not been broadened.

## Validation

- Live Google WebLite sign-in: actual detector selected the username step and filled a dummy username; hidden password remained empty; no submission occurred.
- Live Google through the real unpacked extension in an isolated Chromium profile: mocked fixture vault/API, actual public Google page, approval from credential details, popup closure, field-picker rendering and selected username fill all passed. No Next button or login submission was invoked. The generated test manifest alone received broad required host access to simulate the native optional grant.
- Live Vidya Nepal `/admin/login`: detector selected the existing React-controlled two-field form and successfully filled both fields with dummy values, with no submission.
- A browser regression fixture reproduces the Google-shaped hidden password and named `action` control, verifies username-only filling without submission, and then verifies rejection when the real action attribute changes to another origin.
- Automated validation: **286 unit tests** and **27 interaction browser tests** passed. Extension TypeScript, the development build and `git diff --check` passed. Existing third-party Rollup annotation warnings remain unchanged. The rebuilt development extension is ready in `apps/extension/dist`.

Google's password step and other Google layout variants were not reached in the live check. The existing fixture tests cover a clearly marked password-only step; they do not prove every production variant.

## Try the rebuilt extension

1. Reload Password Manager at `chrome://extensions` or `edge://extensions`, then refresh the Google login page.
2. Unlock the vault. Enable all-HTTPS suggestions in Settings if not already enabled; accept the native permission prompt when required.
3. With a credential saved as `https://google.com`, open **All credentials**, select that account, recognize and approve `https://accounts.google.com` in credential details. Existing approved credentials need no new approval.
4. Click **Fill login**, or close the popup and click Google's username field to choose the account. Advance to the password step yourself and select the account again.

See [the full testing checklist](extension-testing-checklist.md) for permission, matching and lifecycle checks.
