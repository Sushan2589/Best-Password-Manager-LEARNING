# Initial browser-extension distribution

This is a release plan, not a store submission. No store account, listing,
publication or production deployment was created by this task.

## What is possible

A personal project can be submitted to the Chrome Web Store and Microsoft Edge
Add-ons. Publication depends on account registration, required listing/privacy
information, policy compliance and review; it is not automatic approval and is
not an independent security audit.

- [Chrome developer registration](https://developer.chrome.com/docs/webstore/register/)
  requires a one-time registration fee.
- [Microsoft Edge extension registration/submission](https://developer.microsoft.com/en-us/microsoft-edge/extensions)
  is free.
- Chrome supports [public, unlisted and private distributions](https://developer.chrome.com/docs/webstore/cws-dashboard-distribution/).
  Unlisted allows installation through the shared listing link and still requires
  review; it does not restrict installation to named testers.

## Suggested sequence

1. For private technical testing, build against the intended API origin, ZIP the
   built extension directory and share with trusted testers. They extract it,
   enable Developer mode at `chrome://extensions` or `edge://extensions`, and use
   **Load unpacked** to select the extracted folder containing `manifest.json`.
   This is a manual testing path, not a one-click consumer installation.
2. After deployment/privacy/release checks, submit a reviewed private tester or
   unlisted beta listing. That gives early users an actual store installation link.
3. For public release, publish the approved listing and add its real store URL to
   the landing page. Until then, do not invent an install link or store badge.

Before submission, confirm the HTTPS API origin, the installed extension's actual
ID and exact API `EXTENSION_ORIGINS` allowlist, production cookie behavior, icons,
screenshots, support/contact details and public privacy disclosures. Explain
optional website access, local decryption, encrypted server storage and external
favicon hostname/IP disclosure. Provide reviewer access/instructions using a
dedicated sample account without real credentials.

Production hardening and manual Chrome/Edge testing remain separate from store
packaging. No approval times or successful review outcome are promised.
