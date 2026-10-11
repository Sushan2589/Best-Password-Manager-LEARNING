# Website matching troubleshooting

## Report: Vidya Nepal credential not listed

The popup detected `https://www.vidyanepal.tech`, while the reported saved
Website value was `vidyanepal.tech`. Matching requires an exact HTTPS origin:
the scheme, hostname, and effective port must match. Paths are ignored.
The bare hostname is not a valid Website URL under the shared credential
schema. `https://vidyanepal.tech` is valid but has a different origin from
`https://www.vidyanepal.tech`.

Set this credential's Website field to `https://www.vidyanepal.tech` in the
web vault. Lock and unlock the extension after saving to reload its snapshot.
The entry should then appear under This site on `/admin/login`.

## Changes

- Added regression cases for the exact reported HTTPS URL and login path,
  the distinct apex hostname, and a phishing suffix hostname.
- Updated the popup's empty-state guidance to explain exact HTTPS matching,
  the separate `www` hostname, and reloading after web edits.
- Kept strict origin authorization for autofill and credential updates.
  No implicit trust of subdomains or changes to saved credentials.

## Validation

The website matching unit file passed all 32 cases, including these regression
cases. The exact reported HTTPS URLs match. A live HTTP HEAD request to the
login URL returned 200 without an HTTP redirect at the time of investigation.
User credential contents were not accessed; the scheme-less value was reported
by the user and could be shorthand for a full saved URL.
