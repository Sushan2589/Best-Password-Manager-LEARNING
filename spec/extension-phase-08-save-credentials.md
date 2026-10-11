# Phase 08: Save and update credentials

Status: planning only. Do not implement until earlier phases are tested and separately approved.

## Proposed future scope

Detect newly submitted logins and password changes, offer a user-confirmed save/update, validate plaintext locally, encrypt it before an API request, and reuse existing vault create/update endpoints.

## Decisions required first

- How form detection obtains narrowly scoped permissions after popup closure.
- How confirmation and unlocking work when the popup is closed.
- Where briefly captured passwords live and how cancellation/timeout/navigation removes them.
- How updates distinguish accounts and avoid overwriting unrelated credentials.
- How to handle malicious forms, frames, unsuccessful logins, and password-change ambiguity.

Never save without confirmation. Never send captured plaintext to the API or store it persistently. Tests must cover cancelled saves, wrong origins, failed login attempts, stale documents, account selection, and encryption compatibility.
