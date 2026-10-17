# Vault password visibility and extension website icons

## Password entry controls

Added accessible Show/Hide buttons to the web vault unlock/setup fields, all
password fields in the change-vault-password form, and the extension vault unlock
field. Buttons never submit forms; they have field-specific labels, pressed state,
keyboard focus styles, and the controlled input's ID. Values start masked.

The web control keeps only visibility in React state and resets it on form reset
or window blur. The extension continues to keep its input value in a DOM ref,
clears it and masks it before unlocking, and hides it on window blur. Showing a
password does not store it, log it, or send it over the network.

## Extension favicons

Website icons now load automatically beside saved credentials in the extension
list and details. Missing, unsupported, or failed icons fall back to title initials.
There is no separate switch. Icons are only requested after the vault is unlocked
and its credential UI is rendered.

The existing web hostname normalizer has moved to
`packages/shared/src/websiteIcons.ts` (the `@password-manager/shared/website-icons`
subpath), and the web import re-exports that same implementation. Both clients
use Google's favicon endpoint with only the normalized HTTPS public-looking DNS
hostname and image size. Paths, query strings, fragments, credentials, usernames,
and passwords are never included. Local/IP/reserved domains, unsafe schemes,
userinfo and nondefault ports use initials instead. A valid-looking domain is
not proof it is public; custom private domains can still reveal their hostname.

Images use `referrerPolicy="no-referrer"`, lazy loading and an error fallback.
As with the existing web behavior, Google receives the hostname and connection
IP, and the browser may send Google's own cookies depending on browser policy.
No extra extension host permissions or arbitrary URL-fetch broker were added.
The extension image CSP permits only the Google favicon path and its four
known gstatic favicon redirect paths, alongside existing self/data images.
Script/connect restrictions remain in place. This is the requested privacy
tradeoff of automatic external website icons; see also
`website-favicons-privacy-2026-10-17.md`.

## Validation

Updated the existing production web browser checks and extension vault browser
checks to cover visibility toggles without accidental submission, clearing and
re-masking inputs. Added an extension credential browser check for automatic
hostname-only favicon requests, absent referrers, failed-image initials and no
icon requests while locked. Existing normalization unit coverage is shared by
both clients.

Build/reload the extension to apply its image CSP and UI changes. Refresh web
pages after deploying the updated build. No database migration is needed.

Validation passed: web lint and production build, production web security-browser
checks, extension TypeScript/development build, 354 unit tests, and 20 distinct
extension vault/credential browser cases. The favicon failure check reloads its
document to avoid reusing Chromium's already-decoded successful image; it tests
a real failed request and initials fallback rather than assuming each render
causes another network request.
