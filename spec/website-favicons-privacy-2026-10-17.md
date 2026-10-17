# Website favicons: restoration and privacy

## Why icons disappeared

The October 12 security changes intentionally replaced VaultCard's automatic Google favicon requests with local initials (SEC-08). Requesting an icon disclosed the saved website hostname to Google. The image CSP also blocked remote images. The credential form still contained old Google image URLs, making its website picker inconsistent with the vault cards.

## Final behavior requested by the user

Website icons load automatically in web vault cards and the predefined website picker. There is **no on/off toggle, no opt-in step and no icon preference storage**. The intermediate opt-in implementation was removed at the user's request. Any old `password-manager.website-icons.v1` preference is ignored; the app no longer reads or writes it.

- A shared WebsiteIcon component displays the image and falls back to a local initial on a missing/blocked/failed icon. Credential controls remain usable. Google may return a generic icon for an unknown website; the app cannot guarantee a favicon exists for every site.
- Only the normalized hostname is included in the lookup. Saved URL paths, query strings, fragments, account sign-in passwords, vault keys and credential passwords are not included. Images use `referrerPolicy="no-referrer"`.
- URLs are bounded and must resolve syntactically to HTTPS with a valid DNS hostname. Bare HTTPS hostnames are supported. Embedded URL credentials, custom ports, IP literals, single-label hosts and obvious local/reserved suffixes such as `.local`, `.internal`, `.test`, `.example` and `.onion` use initials without external requests. IDNs are converted to their ASCII hostname by the URL parser.
- These checks cannot determine whether a normal-looking corporate hostname actually belongs to a private network. Such hostnames can be disclosed to Google too.
- Google receives requested hostnames and the browser's IP address, potentially with Google's own browser cookies. Restoring automatic icons **accepts this privacy tradeoff**. This supersedes the earlier reports' claim that no automatic third-party favicon requests occur.
- Images are requested directly by the browser. No API proxy or new plaintext list of domains is sent to our backend. No icon or domain is put in application persistent storage; normal browser HTTP image caching may occur.
- The predefined website picker uses the same component. Arbitrary custom website text is not queried on each keystroke; saved custom HTTPS websites receive icons in vault cards.
- Icons are decorative. They do not authorize autofill, establish website identity, change matching rules or modify authentication/encryption.

## CSP

The image policy permits the existing Google endpoint and its observed image-CDN redirect destinations:

```text
https://www.google.com/s2/favicons
https://t0.gstatic.com/faviconV2
https://t1.gstatic.com/faviconV2
https://t2.gstatic.com/faviconV2
https://t3.gstatic.com/faviconV2
```

No broad `https:` image allowance, remote script allowance or `connect-src` exception is introduced. If Google's undocumented endpoint or redirect behavior changes incompatibly, the icon falls back locally rather than widening permissions automatically.

## Files and verification

- `apps/web/src/lib/websiteIcons.ts`: bounded hostname-only URL construction and obvious unsafe/local destination rejection.
- `apps/web/src/app/components/vault/WebsiteIcon.tsx`: automatic image display and error fallback.
- `VaultCard.tsx` and `CredentialForm.tsx`: shared integration without settings controls.
- `apps/web/src/proxy.ts`: restricted image sources.
- `apps/extension/tests/unit/website-icons.test.ts`: 22 URL cases covering hostname-only requests and unsafe/local input.
- `apps/web/tests/security-browser.mjs`: automatic loading without a toggle, real image-error fallback, omitted URL secrets/referrer, no preference storage, website-picker icons and the existing CSP/XSS/password-change regressions.

The live Google endpoint was checked using the public `github.com` domain only and returned a PNG through an allowed gstatic redirect. Automated browser checks intercept icon responses and do not transmit real vault websites. No database migration or new environment variable is required.

Validation: web lint, production build and the complete production security-browser script passed with automatic icons and no settings control. The 22 hostname URL unit cases passed during the restoration; that URL helper was not changed by the removal of the toggle.

Manual check: restart/rebuild the web app and unlock the vault. Public HTTPS credentials should show icons automatically; unavailable/unsafe/local websites show initials. Open Add Credential and its website picker to check the same behavior. In the Network panel, verify `domain=` contains only a hostname, with no saved URL path/query token or Referer header.
# Extension follow-up

The extension now uses the same hostname normalizer from
`packages/shared/src/websiteIcons.ts`. See
[extension icons and password visibility](vault-password-visibility-and-extension-icons-2026-10-17.md)
for its narrow image CSP, automatic loading and fallback behavior.
