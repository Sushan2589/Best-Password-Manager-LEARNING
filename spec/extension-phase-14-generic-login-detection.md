# Phase 14 — Generic login detection across page layouts

## Why the previous Google fix was incomplete

The supplied screenshots show Google's modern desktop sign-in widget. Reproducing `flowName=GlifWebSignIn` revealed **zero HTML forms**, a visible text input with `autocomplete="username webauthn"`, and hidden helper inputs. The earlier live check exercised WebLite, which has an HTML form. Fixing that variant alone did not establish compatibility with the user's layout.

## Shared detection rather than provider-specific rules

The self-contained `content/forms.ts` operation now scans inputs in the top-level document and open shadow roots. It recognizes account fields through standard autocomplete tokens, email input types, labels, placeholders, accessibility names and conservative field identifiers. No provider hostname or Google-specific input ID is part of detection.

Conventional forms retain same-origin action and submit-button checks. Inputs without form owners are grouped by their nearest local container containing a clear account/password pair or explicit `role=form`, without merging competing widgets. A strongly identified standalone account input supports username-first flows. A password-only step still requires `autocomplete=current-password`. Hidden password helpers stay untouched. Ambiguous multiple-account/password groups, one-time-code inputs, search fields and new-password forms are rejected.

Field suggestions use a cheap input-event filter and defer semantic eligibility to the same background detector used by popup and shortcut fills. This prevents independent content-script heuristics rejecting an input that the fill operation supports. Composed event paths and deep active-element lookup support user focus inside open shadow roots.

Native value setters and sequential input/change events remain in use for React-controlled fields. The selected group is recomputed and its signature validated immediately before filling. Signatures contain locator indices and semantic attributes, not field values. Changing the DOM grouping or navigating invalidates stale requests. Each explicit selection fills the detected login pair, or the current step; no Next click or submission is performed.

## Boundaries

This improves generic compatibility; it cannot guarantee every possible website. Closed shadow roots, cross-origin iframe logins, non-input custom editors and ambiguous markup remain unsupported. Exact HTTPS origin matching, encrypted per-account login-origin approvals, browser host permission, active-tab checks, pinned top-level document targeting and trusted extension messaging remain required. No new permissions, dependencies or backend changes were introduced.

## Verification

- Inspected both supplied screenshots without copying the displayed account into fixture data.
- Reproduced the modern Google layout and confirmed it has no HTML forms.
- Live modern Google through the actual unpacked extension in an isolated Chromium profile: fixture vault/API, existing encrypted approved login origin, popup closure, field-picker loading and selected dummy username filling passed. Hidden passwords remained empty and the page did not advance. No Next or login submission was invoked. Broad required access was added only to a generated test manifest to simulate the native optional grant.
- New browser fixtures cover form-less account/password pairs, accessibility-labelled fields with opaque IDs and autocomplete off, open-shadow-root widgets, form-less multi-step username fields, hidden helpers, OTP/search rejection and ambiguous/new-password groups.
- Existing browser fixtures cover real React-controlled inputs, multiple/dynamic forms, origin/action rejection, private picker messaging, popup closure, approval persistence/removal and user-initiated filling.
- Validation: **286 unit tests** and **31 interaction browser tests** passed. Extension TypeScript, development build and `git diff --check` passed. Build warnings are limited to existing third-party Rollup annotations. The updated development build is ready in `apps/extension/dist`.

## Reload and test

Reload the rebuilt extension at `chrome://extensions` or `edge://extensions`, refresh open login pages and unlock again. Enable all-HTTPS suggestions if desired, and approve the exact login origin when needed. Click an account input and select the account. On a two-field widget both fields should fill; on a multi-step flow only the current step fills, and advancement remains manual. Alt+Shift+L and popup **Fill login** use the same detector.

Automated commands and the broader security/lifecycle matrix remain in [the testing checklist](extension-testing-checklist.md).
