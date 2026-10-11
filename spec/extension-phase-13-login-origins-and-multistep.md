# Phase 13 — Approved login websites and multi-step forms

## Result

A credential saved for `https://google.com` can now be used at `https://accounts.google.com` after an explicit, remembered approval. The original website is preserved. The popup and shortcut window show both addresses, require **I recognize and trust this login website**, and save the additional exact HTTPS origin inside the encrypted credential. Approval itself does not fill anything. The user then selects the account to fill.

Field suggestions on a recognized alternate login host offer **Review login website**, opening the trusted extension window. No pending account details or passwords are exposed to the page. Existing matching accounts are shown normally; additional pending approvals are available in the popup or shortcut window.

## Two different permissions

Browser host permission allows form detection. Credential approval allows one account to match one exact HTTPS origin, including its port. Neither substitutes for the other.

Use Settings → **Enable suggestions on all HTTPS websites** for one-time setup across supported sites. If Chrome/Edge withholds access, the popup or shortcut window offers **Allow website access** and requests just the current host through Chrome's native prompt. Access must be granted by a user gesture; the extension cannot inject an on-page prompt before it has access. Browser-managed restrictions cannot be bypassed.

## Matching policy

- Primary website matching remains exact HTTPS origin matching; paths do not matter.
- Optional `approvedOrigins` contains at most 20 canonical HTTPS origins. Aliases include no paths, credentials, query strings, or fragments.
- A conservative hint offers approval for an exact apex/`www` pair and for `google.com` or `www.google.com` → `accounts.google.com`. A hint never authorizes filling.
- Arbitrary subdomains, sibling domains, brand-name substrings and lookalike suffixes do not trigger approval. `google.com.evil.com`, `notgoogle.com`, HTTP and different ports remain rejected.
- Other providers with different login hosts need an exact saved login URL; this change does not infer provider ownership from a common domain suffix.
- Credential details → **Approved login websites** → **Remove** revokes an additional address. Already filled values cannot be removed from a website retrospectively.

## Encryption and compatibility

The shared Zod schema adds only an optional encrypted entry field. Legacy entries are accepted without migration. No API, database, session-cookie, Argon2id or AES-GCM changes were needed. Existing authenticated, locally encrypted conditional updates persist approvals. The server sees ciphertext and a nonce, not approved addresses or plaintext credentials. Web credential editing preserves this field. Credential reads copy the array to prevent callers mutating the private in-memory vault.

## Forms

The shared document-bound form operation now supports a clear username-only step (`type=email` or explicit username/email autocomplete) and a password-only step (`autocomplete=current-password`). Full login forms still fill both fields, including React-controlled inputs, regardless of which field opened the picker.

Each step requires a fresh explicit account selection. The extension does not click Next, submit, or carry a password through a page navigation. One-time codes, ambiguous forms, ambiguous hidden-password fragments, signup/new-password forms and cross-origin form actions are rejected. Iframes, shadow-root fields and formless widgets remain unsupported. Broad website permission does not guarantee compatibility with every site.

## Security boundaries

The suggestion iframe receives only already-matching account summaries, or a boolean indicating that approval can be reviewed. Approval happens in packaged popup/fill UI, never in website content. The shortcut approval broker validates the exact chooser sender, ticket, active tab, target origin, expiry and current authentication, and only offers the narrowly recognized pair. Fill operations recheck the selected credential, target origin, pinned top-level document and form signature. Only the selected credential is delivered to the isolated fill function; no entire vault is sent to content scripts. No form submission is performed.

Native optional permission prompts and actual production login flows require manual Chrome/Edge testing. Automated tests use fixture credentials and never log into real provider accounts. See [the testing checklist](extension-testing-checklist.md) for commands and pass criteria.

## Validation

- Extension unit suite: **286 passed** across 16 files, including legacy crypto compatibility, exact-origin approvals, Google/www hints, phishing and HTTP/port rejection, and forged/stale/unauthorized approval requests.
- Browser suite: **57 passed** across three runs: 25 interaction checks, 31 remaining authentication/cookie/credential/generator/site/vault checks, and the new website-access prompt check. The interaction checks include encrypted approval persistence and removal, separate username/password steps, no-submit behavior, multi-account/form isolation, dynamic forms and real React-controlled inputs.
- Permission prompt check: simulated decline keeps controls disabled; simulated acceptance requests only the exact current host and enables its picker. Native Chrome/Edge prompts remain a manual check.
- Extension TypeScript, web TypeScript, development build and `git diff --check` passed. Build reports only existing third-party Rollup annotation warnings.
- The development build is ready in `apps/extension/dist`. Reload the installed extension and refresh open pages. No production provider login was performed; live-provider compatibility remains a manual check.

Reference: [Chrome permissions API](https://developer.chrome.com/docs/extensions/reference/api/permissions).

Follow-up: [Google form detection fix](extension-fix-google-form-detection.md) adds live-page coverage for hidden password helpers and named form controls. Clearly identified username steps now safely ignore hidden password inputs.
