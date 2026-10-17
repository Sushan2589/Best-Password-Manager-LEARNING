# Password changes without an email confirmation step

Status: implemented at the user's request. Supersedes the password-change email
confirmation flow in `password-changes-and-production-email-2026-10-17.md`.

## Scope

Removed the emailed-code request, code input, challenge state, and proof checks
from both password-change operations. Registration email verification, email
address changes, and informational security emails remain in place. Resend and
its production environment settings are still required for those existing uses.
The account must still have a verified registration email to change passwords;
no new email verification is requested during either password change.

## Current flow

| Operation | Required input | Result |
| --- | --- | --- |
| Change account sign-in password | Current sign-in password, new password and confirmation; fresh authenticator/recovery code when MFA is enabled | Changes the server Argon2 password hash; vault password and ciphertext remain unchanged. |
| Change vault unlock password | Current sign-in password, current vault password, new vault password and confirmation; fresh authenticator/recovery code when MFA is enabled | Verifies the current vault password locally and re-encrypts every entry locally with a fresh salt/key; sign-in password remains unchanged. |

Both actions require an active authenticated session and retain account/IP rate
limits and CSRF origin checks. MFA is checked on the final POST with no recent-MFA
bypass; a recent MFA login does not replace a fresh code. Recovery codes remain
single-use. Without MFA, the current account password authorizes a sign-in
password change; removing email confirmation removes the mailbox-access factor.
Vault changes additionally require local access to the old vault encryption key.

New sign-in passwords retain their length/difference rules and existing breach
check, including failing closed when that check is unavailable. Vault passwords
are never sent to the API or the breach-check service.

Successful changes revoke all account sessions atomically and lock web vaults.
The existing session-version/current-hash/session-expiry checks run again at the
database write. Vault rotation also retains revision/salt checks, complete item
ownership/coverage checks and atomic rollback. Sign-in password changes continue
to cancel pending email-address changes and their old confirmation links.

Generic security notices still send after a completed change. A notification
failure does not reverse an already completed change or block saving. No email
code or email-provider call is required to authorize a password change.

## Code and database compatibility

- Removed `POST /security/password-change/email-code` and its issuing/verifying service.
- `POST /security/login-password` accepts `{ password, newPassword, code? }`.
- `POST /vault/change-password` accepts `{ accountPassword, rotation, code? }`.
- `code` means the existing MFA authenticator or recovery code, never an email code.
- Added `apps/api/src/services/passwordChange.ts` for atomic sign-in changes.
- Removed the shared email-proof schema and the web email-confirmation component.
- Both web forms submit directly; inputs are cleared before network/crypto work.

No database migration or new environment variable is needed for this removal.
The earlier vault-password rotation migration is still required if it has not
already been applied. `20261017_password_change_email.sql` is now historical and
is not required by either current flow. Its legacy table definition remains in
Drizzle for deployed-database compatibility; no destructive table drop or real
Neon operation was performed. Unused legacy rows are not used as authorization.

Deploy the API and web updates together, then refresh open account pages. Old
loaded forms with `emailProof` are rejected by strict validation; they cannot
perform a change using the removed flow. Extension sign-in/unlock/fill contracts
remain unchanged.

## Validation and manual checks

```powershell
npm run typecheck --workspace=api
npm run test --workspace=api
npm run test --workspace=extension
npm run lint --workspace=web
npm run build --workspace=web
npm run test:security --workspace=web
```

Tests cover direct password changes without an email challenge, missing/invalid
fresh MFA, replayed recovery codes, unchanged vault ciphertext on login-password
changes, local vault re-encryption compatibility, all-session revocation, commit
rollback, revoked/stale sessions, CSRF/rate limits, and notification failure.
The PostgreSQL fixture runs without applying the email-challenge migration.
Web browser checks assert there is no email-code field or email-code request,
verify fresh MFA is sent on the final POST, and retain cross-tab locking, password
input cleanup, mobile layout and registration email-verification coverage.

Validation: all 66 API tests and 354 extension/shared/web-crypto unit tests passed.
API typecheck, web ESLint/production build, extension typecheck/development build,
and the production web security-browser checks passed. Email delivery was mocked;
no real Neon schema or production secrets were changed.

Manual checks with a test account:

1. With MFA disabled, change the sign-in password directly using its current
   password. Sign in again with the new password and unlock the unchanged vault.
2. Change the vault password. Sign in with the unchanged account password;
   the old vault password must fail and the new one must decrypt every entry.
3. With MFA enabled, missing/incorrect/used codes must fail. A fresh authenticator
   or unused recovery code must succeed even without any email-code request.
4. Confirm other active sessions are revoked after either successful change.
5. Confirm registration verification and email-address changes still send their
   existing verification emails, and security notices still arrive.
