# Phase 06: Secure autofill

Status: planned; requires approval.

## Scope

Explicit popup selection and Fill action. Add `scripting` with temporary `activeTab` access. Initially fill only the authorized top-level document; exclude cross-origin iframes. The worker validates the trusted popup sender, active tab, credential match, document identity, scheme, and origin before releasing only the selected username/password. Recheck origin inside the isolated content script immediately before writing.

Content scripts cannot request vault data or trigger fill. Do not use `window.postMessage`, page scripts, DOM attributes, remote code, or automatic submission. Detect visible eligible login fields at fill time; support dynamic forms and native input setters/events for controlled inputs where practical. Multiple or ambiguous forms require a clear selection or safe failure.

Once values are filled, the authorized website can read them. A compromised authorized page cannot be made safe by extension messaging; domain checks control delivery, not page behavior after filling.

## Acceptance tests

- Username/email/password inputs, multiple forms, hidden fields, signup/password-change forms, dynamic DOM, and controlled inputs.
- Only selected credentials delivered; no form submission.
- Phishing hosts, HTTP, unrelated frames/tabs, tab/document navigation races, and forged messages never receive secrets.
- Popup closure, worker restart, lock, and session expiration deny stale operations.

Record supported form patterns, known limitations, and manual checks before Phase 7 approval.
