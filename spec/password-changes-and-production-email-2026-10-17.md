# Password changes and production email

Update: the password-change email confirmation described below has been removed
at the user's request. See [the current flow](password-change-without-email-2026-10-17.md).
The Resend/environment configuration below still applies to registration,
email-address verification and informational security notices. The email-challenge
migration is historical and is no longer required. Earlier implementation details
below are retained as a historical record. No backup feature was added.

## Two independent passwords

Account security contains separate sections:

| Action | Changes | Preserves |
| --- | --- | --- |
| Change vault password | Vault salt, verifier, key version and every encrypted credential | Account sign-in password, MFA enrollment, credential content/IDs/timestamps |
| Change sign-in password | Server Argon2 password hash | Vault unlock password, salt, verifier and encrypted credentials; MFA enrollment |

The vault section has an explicit notice before the form: **only the vault unlock password changes; the sign-in password stays the same**. Its authorization field is now called **Current account sign-in password**. The buttons say **Change vault password**. The sign-in section explains that changing the login password does not change or recover the vault password.

Successful changes increment the existing session revocation version and revoke all account sessions atomically. Users sign in with the appropriate sign-in password, then unlock with the appropriate vault password. Both operations lock updated web tabs; extensions observe revocation through existing authorization checks. A lost commit response is reported as an unknown result, without automatically retrying.

A sign-in password change also cancels pending email-address changes and their confirmation links atomically, so a previously requested email-change link cannot survive this account-security change.

## Required email authentication

1. In either form, enter the current account sign-in password. If MFA is enabled, enter a fresh authenticator code or unused recovery code.
2. Choose **Send email verification code**. `POST /security/password-change/email-code` reauthenticates the current account and checks fresh MFA, without the recent-MFA bypass. The recipient is always read from the verified database account; callers cannot supply a different recipient.
3. The API generates an eight-digit code using Node's cryptographic `randomInt` and a separate 32-byte random challenge. The email explicitly says whether it authorizes a **sign-in password** change or a **vault unlock password** change.
4. The client receives only the opaque challenge and expiry, never the email code. It holds the challenge in component memory; no localStorage, sessionStorage, IndexedDB or persistent extension storage is used.
5. Enter the eight-digit email code in the same form and submit. This is separate from the six-digit authenticator code. The server requires valid email proof plus the current account password. For vault changes, the existing local password verification and complete re-encryption happen before the final POST.
6. The proof is checked again inside the atomic password-changing SQL statement. Successful revocation deletes its session and cascades deletion of all corresponding challenges, preventing replay.

Each challenge is bound to account, requesting session, action purpose, current verified email and a fingerprint of the current account password hash. Codes expire after ten minutes and permit at most five verification attempts. Requesting another code for the same account/purpose replaces the previous challenge. Codes do not transfer between login/vault changes, accounts, sessions or changed email addresses.

Only challenge/code hashes are stored. The code hash includes the random challenge, whose plaintext is **not** stored in the database. A database copy alone therefore does not supply the challenge needed to enumerate the short email code offline. The database never stores either master password, raw encryption key, raw email code or raw challenge. Comparison of code hashes uses `timingSafeEqual`.

Email requests are limited to three per account per fifteen minutes, shared across both change types, in addition to existing sensitive account/IP limits. Existing limits are process-local; use one API instance until the planned Arcjet/shared enforcement work is implemented. An email delivery failure invalidates that challenge and does not change any password. An emailed code can be consumed as an attempt even if a later account/vault conflict prevents saving; retries require valid, unexpired proof.

The new login password must differ from the current password, contain at least 15 Unicode code points, and fit the 1024-code-unit limit. It uses the existing Argon2 server hashing and HIBP prefix-only compromised-password check. An unavailable safety-check service blocks the change, keeping the existing password. Vault master passwords remain local and are not sent to the compromised-password service.

## How email is sent

The Hono API uses the existing **Resend Node SDK**, authenticated using server-only `RESEND_API_KEY`. No browser or extension calls Resend directly. `apps/api/src/services/email.ts` sends registration verification, verified-email-change messages, generic security notifications, and the new password-change codes.

Every message now uses the configurable **`EMAIL_FROM`** address. Development defaults to `onboarding@resend.dev`. Production rejects a missing sender, a sender on the `resend.dev` test domain, or a missing API key. Sender configuration is validated as a bare email address, with no header newlines. Resend requests have a ten-second network timeout. Fixed errors are returned without logging provider diagnostics, recipients, codes, passwords or request bodies.

The production tests mock Resend delivery. This task did **not** send real emails, verify DNS, configure a Resend account, or modify real environment secrets.

## Production configuration

### Resend and DNS

1. Add a domain or sending subdomain you control to Resend, for example `mail.your-domain.example`. Add the exact DNS records Resend supplies for sending (SPF/DKIM), and wait until the dashboard marks the domain verified. Do not invent or copy example DNS values. See [Resend domain setup](https://resend.com/docs/dashboard/domains/introduction).
2. Set `EMAIL_FROM=security@mail.your-domain.example` using that verified domain. The example domain here is a placeholder. The `onboarding@resend.dev` testing sender is restricted to the address associated with the Resend account and cannot deliver general production mail. See [Resend test-domain restrictions](https://resend.com/docs/knowledge-base/403-error-resend-dev-domain).
3. Create a production API key with sending permission restricted to the sending domain when available. Keep it in the API hosting platform's secret environment settings. Use separate development and production keys. See [Resend API keys](https://resend.com/docs/dashboard/api-keys/introduction).
4. Configure DMARC according to your domain's mail setup. Avoid overwriting existing mail-provider MX/SPF records indiscriminately. Disable open/click tracking for these security emails; the app does not need it. Review the provider's message storage/access settings because email codes necessarily pass through the provider and recipient's mailbox.
5. Test registration verification, password-change codes for both actions, verified email changes and security notices to addresses you control. Inspect delivery/bounce status in Resend; API acceptance is not proof that an email arrived in the inbox. Check spam and account sending limits. Never paste codes or API keys into app logs or issue reports.

### API environment

Use `apps/api/.env.example` as the maintained variable inventory. Set real values in your hosting platform, never in the example file:

```dotenv
NODE_ENV=production
DATABASE_URL=<private Neon connection string>
RESEND_API_KEY=<private production sending API key>
EMAIL_FROM=security@mail.your-domain.example
WEB_ORIGIN=https://app.your-domain.example
EXTENSION_ORIGINS=chrome-extension://<actual-32-character-extension-id>
MFA_ENCRYPTION_KEY=<existing-64-hex-character-server-key>
SECURITY_STATE_DIR=/private-persistent-volume/security-state
TRUSTED_PROXY_IPS=<exact immediate trusted proxy IPs, or leave empty>
```

Use your actual extension ID, not the literal placeholder. `WEB_ORIGIN` must be the exact HTTPS origin without a trailing path or slash. The MFA key must be 32 cryptographically random bytes encoded as 64 hex characters. **Preserve the existing key for an existing MFA database**; replacing it without a separate re-encryption migration makes enrolled authenticator secrets unreadable. Never expose database, mail or MFA secrets with `NEXT_PUBLIC_` or `VITE_` prefixes.

The API currently listens on port 3001. Configure the deployment's reverse proxy/container accordingly. Keep the revocation state directory on a private durable volume and use a single API instance under the current process-local protections. Only trust proxies you control that overwrite `X-Forwarded-For` with one validated address; leaving the proxy allowlist empty is safer than trusting arbitrary forwarding headers. Arcjet deployment is not part of this change.

### Web and extension build configuration

`apps/web/.env.example` contains `NEXT_PUBLIC_API_URL`; copy it to `.env.local` locally. Set the actual HTTPS API origin **before building** in production:

```dotenv
NEXT_PUBLIC_API_URL=https://api.your-domain.example
```

`apps/extension/.env.example` contains `VITE_API_ORIGIN`. Set its production value to the same HTTPS API origin before the extension build. These two values are public and embedded into browser bundles; they are not secrets. Rebuild after changing them and reload/distribute the updated extension.

Use HTTPS web/API origins under the same parent site, such as `app.your-domain.example` and `api.your-domain.example`. The current session cookie is HttpOnly, production Secure and SameSite=Lax. Unrelated hosting domains can make cookie authentication fail; do not weaken cookie policy as a workaround. Configure exact CORS/extension origins and test real login cookies after deployment. No new extension permissions are required.

## Migrations and deployment order

The real Neon database has not been changed. Existing `20261012_security.sql` and `20261017_vault_password_rotation.sql` remain prerequisites.

Apply **`apps/api/migrations/20261017_password_change_email.sql`** in the intended Neon branch's SQL editor before using the new flows. It adds `password_change_challenges`, its foreign keys, uniqueness and bounds. It does not change existing passwords, vault salts, credentials or MFA enrollment. It can be applied repeatedly. `npx drizzle-kit push` is not required to apply this checked-in SQL; do not approve unrelated destructive schema changes.

Deploy the updated API everywhere, then the web app; keep the previous vault-write guards deployed. Refresh open web tabs and reload the rebuilt extension. Previously loaded web code that submits password changes without email proof now fails closed; ordinary login/unlock/save behavior remains supported. Keep example files tracked and real `.env` files ignored.

## Validation and manual checks

Local validation passed: all **64 API tests**, all **315 extension/shared/web-crypto unit tests**, API and extension TypeScript checks, web ESLint and production build, and the production web security-browser script including both email-confirmed password-change forms. The final password-change database regression run also passed after adding pending-email cancellation and the commit-time verified-email check. Email delivery was mocked throughout; the real Neon schema and production Resend/DNS configuration were not changed.

The API suite uses local PGlite and mocked email delivery; no running API, Neon connection or live Resend send is needed. Database startup hooks allow 60 seconds for WASM initialization, and API tests use two workers to bound memory/CPU on CI. This does not relax authentication or browser assertion timeouts.

Tests cover reauthentication/verified-email restrictions, hashed-only proof storage, purpose/session/email binding, expiry, replacement, five-guess exhaustion, email delivery failure, breach-check failure, login-only changes preserving the vault, atomic revocation rollback, CSRF, email-rate limits, production sender validation, and the existing vault-rotation/crypto regressions. Production web browser checks exercise both separate forms, mandatory email confirmation, invalid-code errors, password input cleanup, local re-encryption, cross-tab locking, sign-out messages and mobile width.

Manual acceptance:

1. Apply migrations and configure Resend using a test account/address you control.
2. Confirm the vault-only notice appears before submitting. Verify requesting a code does not change either password and emails the verified account address only.
3. Try missing, incorrect, expired and replaced codes; try a code in a different session/action. Confirm nothing changes. A code must stop working after five failed attempts.
4. Complete a vault password change: existing sign-in password still works, old vault password fails, new vault password decrypts all entries, and all sessions were revoked.
5. Complete a sign-in password change: old sign-in password fails, new sign-in password works, and the **same existing vault password** still decrypts unchanged credentials. MFA remains enabled.
6. Test email failure with an invalid development provider configuration: neither password changes. Restore correct configuration and request a fresh code/MFA proof.
7. Test real HTTPS cookies and the updated extension on production origins. Avoid using real credentials in screenshots or console recordings.
