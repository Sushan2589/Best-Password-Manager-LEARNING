# Extension release compatibility and usability review

## Scope and status

This review distinguishes public-page detection, fixture-based extension behavior,
and real-account acceptance. Passing a detector probe is not an end-to-end login
pass. No personal browser profile, real password-manager account, website password,
MFA device, inbox, Neon database or production session was used by this task.
No form was filled or submitted on a live website, and no website account was
created. Real-account/native-browser acceptance remains pending below.

## Public website checks performed

Run started at **2026-10-18 03:21:40 UTC**, using installed **Google Chrome
155.0.8059.80** and **Microsoft Edge 155.0.4283.45**, headless, signed-out and
isolated from personal profiles. Locale was `en-US`.

Repository base commit: `21f77f8f493bf71be545c458907b8f1edcf4db2a`.
Detector source SHA-256:
`41005d1c8a57a1e34451656784489a48a8642064d0cc821213850d2de5c0221d`.
The test harness/checklist additions in this review do not change that detector.

The production `formOperation` detector was compiled from the repository and run
in a CDP isolated world with **probe mode only**. The script did not load the
extension or grant permissions. Results contain counts/kinds, origins and status
codes, not input values, HTML, cookies, screenshots or token-bearing URLs.

| Public page | Chrome probe | Edge probe | Observed form kind |
| --- | --- | --- | --- |
| `https://accounts.google.com/ServiceLogin` | Detected, HTTP 200 | Detected, HTTP 200 | Username step |
| `https://www.facebook.com/login/` | Detected, HTTP 200 | Detected, HTTP 200 | Login form |
| `https://www.instagram.com/accounts/login/` | Detected, HTTP 200 | Detected, HTTP 200 | Login form |
| `https://www.linkedin.com/login` | Detected, HTTP 200 | Detected, HTTP 200 | Login form |
| `https://github.com/login` | Detected, HTTP 200 | Detected, HTTP 200 | Login form |
| `https://login.live.com/` | Detected, HTTP 200 | Detected, HTTP 200 | Username step |
| `https://www.vidyanepal.tech/admin/login` | Detected, HTTP 200 | Detected, HTTP 200 | Login form |

All 14 probes returned one supported top-document group. No navigation timeout
or the script's listed challenge-text signals were observed. Google/Microsoft
included child frames, but the detected group was in the top document; this does
not add child-frame autofill support. Consent overlays, invisible anti-automation
signals, alternate layouts, other languages, real password steps, passkeys,
account challenges and successful sign-in were not established by these results.

Repeat explicitly (requires installed Chrome and Edge and internet access):

```powershell
npm run test:sites --workspace=extension
```

The opt-in script is `apps/extension/scripts/check-live-sites.mjs`; output is
`apps/extension/test-results/live-site-probes.json` (ignored). The normal browser
runner may clear this output directory on a later run. The durable summary is
the table above; results can change as sites change. This command is a diagnostic,
not a release certification or an offline CI dependency.

## Automated extension checks

The existing browser suite uses actual packaged MV3 extensions in Playwright's
Chromium, fixture-encrypted credentials, mock APIs or a real loopback cookie API.
It covers controlled/dynamic forms, username/password-only steps, multiple accounts,
document/navigation binding, iframe and cross-origin rejection, approved login
origins, explicit save/update confirmation, encryption, permission denial/grants,
verification races, sign-out, and memory-owner/service-worker behavior.

Added `tests/browser/restart.spec.ts`: two full browser-process restarts reuse the
same on-disk **test** profile. Both the 15-minute policy and **Until browser closes**
must retain their nonsecret lock setting while reopening with the vault locked,
empty password input, empty session storage and no plaintext fixture credentials
or vault key in extension storage. Re-unlocking with the test password must work.
Authentication is fixture-valid here; this does not prove production cookie
survival, a laptop shutdown, or crash recovery on branded browsers.

Execution results:

- Extension development build and TypeScript: passed.
- Extension unit tests: **354 passed** across 20 files.
- API security/password/MFA/database tests: **84 passed** across seven files.
- Production web security/browser suite: passed, including verification handling,
  authenticator enrollment UI, session revocation, master-password re-encryption,
  fresh-MFA password changes and mobile form checks, using local fixtures.
- Full packaged extension browser suite: **73 passed** in 9.6 minutes, including
  both new full-browser restart regressions. No retries were needed. The browser
  suite's production-like behavior is fixture-based; native permission replies
  and actual provider-account sign-ins are not included in that count.

## Why native Chrome/Edge acceptance is separate

[Playwright's extension documentation](https://playwright.dev/docs/chrome-extensions)
states that Chrome/Edge removed command-line flags used for automatic extension
side-loading. The packaged test suite therefore uses Playwright Chromium. Public
form probes can still use installed Chrome/Edge without an extension.

Native toolbar invocation, Alt+Shift+L OS shortcuts, browser permission prompts,
site-access settings, store/unpacked installation and real account challenges need
the manual pass below. Test-manifest grants and simulated permission answers do not
establish that native browser UI works. No personal profile is modified to bypass
these restrictions.

## Real-account acceptance checklist — pending

Run the entire checklist in **both Chrome and Edge**, using dedicated test accounts
you control. Keep passwords, verification links, authenticator keys, recovery codes,
session cookies and traces containing real credentials private. Record only
PASS/FAIL/BLOCKED, browser/version, site and a sanitized description.
Screenshots of revealed passwords and exported personal vaults are unnecessary.

Setup:

1. Use a supported Node runtime, start the web/API with intended configuration,
   build the extension against that API and manually load `apps/extension/dist`.
   In production staging use HTTPS, the actual extension ID in `EXTENSION_ORIGINS`,
   LIVE Arcjet, verified Resend sender and private MFA/revocation settings. A fixture
   API does not validate this configuration.
2. Use an isolated test browser profile and a dedicated password-manager account.
   Keep the browser's built-in password-fill suggestions out of the way during
   these checks so their success is not mistaken for our extension's behavior.
3. Store test-account logins with the exact intended HTTPS website. Add a second
   test account for at least one site to verify selection. For Google root/login
   differences, explicitly review and approve the displayed login origin; never
   approve an unrelated address to make a test pass.

| Acceptance scenario | Expected result | Chrome | Edge |
| --- | --- | --- | --- |
| Register and open before verifying email | Restricted verification screen; cannot unlock/read/write vault | Pending | Pending |
| Resend, follow real verification email, return/focus/refresh | Cooldown respected; status updates; verified user can proceed | Pending | Pending |
| Sign in with wrong/correct account password | Clear sanitized error or valid session; passwords clear appropriately | Pending | Pending |
| Vault setup/unlock and wrong vault password | Correct password unlocks; wrong one exposes no entries or write capability | Pending | Pending |
| MFA enrollment with real authenticator app | Setup key versus app-generated code is clear; recovery codes shown privately; session revoked as designed | Pending | Pending |
| MFA sign-in and fresh sensitive-action verification | Incorrect/expired/replayed code rejected; current valid code works | Pending | Pending |
| Recovery code | One chosen test recovery code works once; second use fails | Pending | Pending |
| First-login autofill setup: dismiss/deny | No automatic permission prompt; denied grant changes no enabled preference | Pending | Pending |
| First-login setup: explicitly enable and accept | Native grant succeeds; supported sites get suggestions after required refresh | Pending | Pending |
| Grant only one host, visit another, then grant globally | Host-only access stays scoped; global setup needs one explicit grant | Pending | Pending |
| Revoke/restrict browser site access while enabled | No silent regrant; clear prompt/fallback; unrelated sites get no credential | Pending | Pending |
| Field suggestions with popup closed | Matching account picker appears on field focus; choosing fills correct group | Pending | Pending |
| Alt+Shift+L and context-menu fill | Native invocation opens chooser; chosen account fills form without submitting | Pending | Pending |
| Multiple accounts on one website | Correct account selectable; only chosen credentials fill | Pending | Pending |
| Native multi-step sign-in | Username selection fills current step only; user presses Next; fresh selection fills password; user submits | Pending | Pending |
| Provider OTP/passkey/challenge step | Saved password is not injected into OTP/passkey controls; user completes challenge | Pending | Pending |
| Manual save/cancel | Draft/cancel creates nothing; explicit confirmed save survives lock/reopen | Pending | Pending |
| Watch submission/review capture | Opt-in watch, then actual test submission; review is explicit; cancel/timeout does not save | Pending | Pending |
| Password update | Selected existing test entry updates only after review/confirmation; no duplicate/unrelated update | Pending | Pending |
| Lock policy: popup-close | Closing popup locks; field fill requires unlock again | Pending | Pending |
| Default 15-minute/30-minute policy | Closing popup keeps memory owner; actual inactivity eventually locks; manual lock works immediately | Pending | Pending |
| Until browser closes | Popup reopen stays unlocked while session valid; closing all normal windows locks, including browser background mode | Pending | Pending |
| Fully exit/relaunch browser, session restore, laptop restart | Vault always requires unlock; saved preference remains; no plaintext restored | Pending | Pending |
| Session expiry or server revocation | Suggestions/fill stop, profile/vault clear; one may need to sign in again | Pending | Pending |
| Extension reload/update | Vault locks; refreshed pages use new content scripts; no stale picker can fill | Pending | Pending |
| Logout success and simulated server failure | Local vault clears; confirmed logout revokes session; failed server logout gives retry guidance | Pending | Pending |
| Small screens/keyboard/zoom and password visibility controls | Controls fit; focus is visible; labels clear; show/hide works on password inputs | Pending | Pending |

Once autofilled, values are under the website's control; locking is not expected
to erase a page's already-filled inputs or the system clipboard. An unsupported
iframe/closed-shadow-root form should fail safely, rather than loosen origin
matching or gain access to the whole vault.

## Per-site real-account sign-off — pending

For each site, first verify the suggestion menu with the popup closed, select a
test account, verify all supported fields, and manually submit. Repeat with the
shortcut, test incorrect-origin nonmatching without visiting malicious domains,
and repeat after closing/reopening the browser and unlocking again.

| Website | Additional behavior to cover | Chrome | Edge |
| --- | --- | --- | --- |
| Google | Root-to-login approval; real password step after Next; account chooser; OTP/passkey alternative | Pending | Pending |
| Facebook | Combined form; remembered account variant; MFA/checkpoint when offered | Pending | Pending |
| Instagram | Dynamic UI after load; username/email; MFA/checkpoint when offered | Pending | Pending |
| LinkedIn | Combined form; account variants; verification/security challenge when offered | Pending | Pending |
| GitHub | Username/password then OTP/passkey; multiple test accounts | Pending | Pending |
| Microsoft | Save the actual HTTPS login origin; username-first/password/OTP or passwordless alternative | Pending | Pending |
| Vidya Nepal | Focus either field; both fields fill; correct account; no automatic submit | Pending | Pending |

Do not mark an unavailable account/challenge as passed: use **Blocked** with the
reason. A detected public username step does not sign off a provider's password
step. The current public probes establish compatibility for the observed variants
only; they do not establish support for every website.

## Findings so far

- Public detection passed all 14 observed page/browser combinations, so no
  production selector or origin relaxation was justified by this run.
- The extension README still described a five-minute default and a universal
  one-hour cap; corrected it to the actual 15-minute default, 30-minute option,
  and separate browser-session policy. This was documentation drift, not a
  runtime policy change.
- Alias trust is deliberately limited: apex/`www` pairs and the existing Google
  login hint can offer explicit approval. A saved `microsoft.com` credential does
  not automatically match `login.live.com` or `login.microsoftonline.com`; save
  the actual intended HTTPS login origin. This is a usability limitation to
  include in acceptance, not justification for trusting arbitrary subdomains or
  unrelated domains. The public Microsoft probe only tested `login.live.com`.
- Full real-account/native-browser acceptance is still pending. This review
  does not declare the project production-ready on the strength of fixture tests.
