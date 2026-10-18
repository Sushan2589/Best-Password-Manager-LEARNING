# Self-hosted web fonts

## Before and after

The web app already used `next/font/google`, which downloads fonts at build time
and serves the resulting files from the application's own origin. Visitors were
not making Google Fonts requests. The existing CSP already enforced `font-src
'self'`. This was not an existing browser font privacy leak.

The app now uses `next/font/local` with checked-in, upstream variable WOFF2 files
for **Inter** (body, weights 100–900) and **Plus Jakarta Sans** (display, 200–800).
Both normal-style fonts are stored in `apps/web/src/app/fonts/`, alongside their
SIL Open Font License notices and a README recording pinned upstream revisions,
download URLs and SHA-256 hashes. The full upstream files preserve their provided
glyph coverage; this does not promise coverage of every language.

`layout.tsx` retains `--font-body` and `--font-display`, so components and the
landing page keep their font families and variable weights. `display: swap`
keeps text visible during loading. Next bundles, hashes and serves the WOFF2
assets under `/_next/static/media/` and retains its local font preload/fallback
behavior. The Tailwind sans/mono aliases no longer reference unused Geist variables.

There is no Google font download during the web font build step or browser font
loading. Asset downloads were a one-time development operation; no new dependency,
font downloader, remote CSS import or environment variable is required.
The existing strict font CSP remains intact. This does not mean the entire build
is offline: npm installation and unrelated build services may still use networking.

The extension currently uses a system font stack with Inter preferred if available;
it has no remote font import. This change bundles fonts in the web application
only and does not change extension packaging or its CSP.

## Verification

```powershell
npm run lint --workspace=web
npm run build --workspace=web
npm run test:security --workspace=web
```

The production browser suite waits for fonts to load and verifies at least two
loaded font faces, WOFF2 requests from the local web origin, and the existing
`font-src 'self'` policy. Landing-page external network requests are blocked and
asserted absent. Existing mobile/navigation/authentication/vault checks still run.

Manual check: open DevTools → Network → Font and reload. Requests should use our
own origin and `/_next/static/media/*.woff2`, with no `fonts.googleapis.com` or
`fonts.gstatic.com` font requests. The Google favicon provider is a separate,
previously documented feature and is not part of font loading.

Validation completed: web lint, production build (including TypeScript) and the
full web security browser suite passed using Node 22.23.3. The production font
checks passed, and the desktop landing screenshot was visually reviewed.

## References

- [Next.js font optimization](https://nextjs.org/docs/app/getting-started/fonts)
- [Pinned asset provenance](../apps/web/src/app/fonts/README.md)
