# Account security controls and authenticator instructions

## Problem

Authenticator setup and session revocation appeared unclickable because their buttons were silently disabled while the shared account-password field was empty. Setup cleared that password after its first request, but the page did not explain that activation needed it again. The setup key and the six-digit authenticator code were insufficiently distinguished. Failed status/session requests could appear as MFA being off or an empty session list.

## Changes

- Actions respond to a missing password with a visible explanation and focus the current account-password input. Server-side password/factor checks remain unchanged. Buttons stay disabled during pending requests/loading or after the current session is ended.
- The password field explicitly asks for the password used to sign in to the password manager and explains why it clears after each request.
- Authenticator protection shows its status and explains that it is optional, app-based and not an email code.
- Setup includes numbered steps: open an authenticator app, add a manually entered time-based account, put the setup key in that app, then enter the app's current six-digit code in the website. Activation explicitly requires entering the account password again. Invalid/missing app codes receive an explanation and focused input.
- Setup can be cancelled locally; the pending server setup continues to expire after its existing ten-minute lifetime. No secret is persisted by this interface.
- Recovery codes remain visible after successful activation, with offline-saving instructions. All-session revocation is reflected as signed out, with a sign-in button, rather than attempting to silently refresh through the revoked session.
- Session revocation explains that MFA need not be enabled. Revoking another session preserves the current one; revoking the current session explicitly says it will sign out and shows the signed-out state afterward.
- Status/session loading errors have visible recovery guidance instead of masquerading as empty data.

## How to use

1. In Account security, enter **Current account password**.
2. To sign out a session, click its **Revoke session** button. The current session's button explicitly says it will sign you out. If MFA is enabled, supply a fresh app/recovery code when required.
3. To enable MFA, click **Set up authenticator**. Add the displayed setup key to an authenticator app as a time-based account named Password Manager.
4. Enter your account password again above. Put the app's current six-digit number in **Authenticator code**, then click **Enable MFA**.
5. Save the displayed recovery codes offline, then sign in again using your account password and a fresh app code.

## Validation

Production Next.js build (including TypeScript) and ESLint pass. The production Chromium fixture suite exercises missing-password feedback/focus without sending a request, revocation of a different session while MFA is off, password cleanup, setup instructions, six-digit validation, password-confirmed enrollment, removal of the displayed setup key, recovery-code display and signed-out state. The existing CSP, vault/XSS and fragment-verification checks remain included. No real account, database or email service is contacted by these tests.
