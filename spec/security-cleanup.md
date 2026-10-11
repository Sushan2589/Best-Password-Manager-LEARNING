# Logout and console logging cleanup

Date: 2026-10-11

## Purpose

Remove sensitive diagnostic output and consistently clear local vault access when logging out, losing a session, or signing into another account. This is a focused cleanup before developing the browser extension.

## Changes made

### Logout and vault state

- Account-page logout clears the in-memory vault key before contacting the API.
- Vault-page logout immediately locks the vault before contacting the API. Locking clears the key, decrypted credential list, password input, visibility flags, selected deletion target, loading state, and existing error.
- Local locking still occurs when the logout request fails. A failed request can leave the server session active; local locking does not imply successful server logout.
- The vault loading effect ignores results after its cleanup runs, so an old request cannot repopulate decrypted credentials after locking or leaving the page.
- The vault layout clears the key before redirecting to login after a failed session check, including connection failures.
- Account and profile-edit pages clear the key when their session check returns HTTP 401.
- Successful login clears any key left from a previous account before proceeding to verification or the vault.

### Console output

- Removed raw vault-key output from the key derivation script and browser test page.
- Removed full database user-record output from the database test script.
- Removed raw profile API response output and registration response-object output.
- Replaced raw exception logging across frontend flows and API routes with fixed messages. Database/SDK exceptions can contain query parameters or response data, so exceptions are not passed to the console.
- Removed registration debug messages, including the registered user's ID, and the database environment-presence message.
- Removed commented-out encryption test logs that demonstrated printing ciphertext and decrypted content.
- Retained fixed operation messages and the API startup address. These do not include credentials, keys, account data, tokens, or query objects.

User-facing error handling remains in place. Fixed diagnostics provide less debugging detail; any future structured logging must explicitly allow safe fields rather than serializing arbitrary errors or payloads.

## Validation

- Frontend TypeScript: `tsc --project apps/web/tsconfig.json --noEmit --incremental false` passed.
- Backend TypeScript: `tsc --project apps/api/tsconfig.json --noEmit` passed.
- `git diff --check` passed.
- Frontend ESLint could not complete: the installed Zod package is missing `v4/locales/tg.cjs`, required by the React Hooks ESLint plugin. Dependencies were not changed as part of this cleanup.
- Reviewed all console call sites under `apps` for data-bearing arguments.
- No database scripts, email scripts, migrations, or live authentication requests were executed.
- Browser interaction checks below are a manual checklist, not completed runtime tests.

### Manual browser checklist

1. Unlock an existing vault, visit Account, log out, then sign in again. The vault must prompt for its password.
2. Log out from the vault with the API unavailable. Local credentials must disappear and the vault must lock even though server logout fails.
3. Delay a vault fetch, lock the vault while it is pending, then let it finish. Returning to the locked view must not restore decrypted items.
4. Expire/revoke a session and navigate to the vault or account pages. Redirecting to login must clear the existing key.
5. Sign into another account in the same tab. The previous account's key must not remain available.
6. Inspect browser and API consoles during registration, login, unlock, credential operations, and profile changes. No raw credentials, keys, account records, response bodies, or exception objects should appear.

## Follow-up before extension development

- `unlockVault()` still derives a key and reports success without verifying the password. Reliable checking, including an empty vault, needs an encrypted verification value plus a compatibility/migration plan. This cleanup leaves the existing ciphertext format and derivation parameters intact.
- Unlock state remains in memory and a page refresh still locks the vault.
- Key cleanup is scoped to the current web-app context. Cross-tab logout/locking requires a separate coordination mechanism.
- Extension authentication, cookie/host configuration, and production HTTPS settings still need design and implementation.
- Changing an account email currently does not reset verification or verify the replacement address.
