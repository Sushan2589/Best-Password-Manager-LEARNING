# Landing page Lighthouse improvements

## Audit source and baseline

The user's desktop/mobile JSON did not arrive: the message ended at `{`. The
following measurements are our **local production landing-page audits**, not an
interpretation of the missing reports or a claim about deployed performance.
The assumed target is `/`, the most recently developed landing page.

Lighthouse **13.5.0**, installed Chrome **155.0.8059.80**, isolated headless browser,
production Next server on `http://127.0.0.1:4178`. No API/account login, real vault,
Neon, Resend or live Arcjet request was used. Mobile uses the default simulated
150 ms RTT, 1,638.4 Kbps throughput and 4× CPU slowdown; desktop uses its preset.
Audits run sequentially to limit contention. Local HTTP receives Lighthouse's
loopback secure-context treatment and does not validate deployed TLS/proxy behavior.

| Local baseline | Performance | Accessibility | Best practices | SEO | FCP | LCP | TBT | CLS |
| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: |
| Mobile, initial server run | 62 | 96 | 100 | 100 | 1.5 s | 5.1 s | 680 ms | 0 |
| Mobile, warm server repeat | 63 | 96 | 100 | 100 | 1.6 s | 5.1 s | 560 ms | 0 |
| Desktop | 98 | 96 | 100 | 100 | 0.5 s | 1.1 s | 50 ms | 0 |

Warm-server mobile transferred about **750 KB**, including approximately 352 KB
for Inter and 61 KB for Plus Jakarta Sans. Lighthouse flagged screenshot delivery
(approximately 67 KiB mobile/275 KiB desktop estimated savings), color contrast,
brand label/name mismatch, framework JS, render-blocking CSS and no-store bfcache
limitations. Baseline desktop and mobile HTML/JSON reports are saved locally in
`apps/web/.lighthouse/`, which is ignored and retained across builds.

## Changes

### Responsive screenshots

- Use Next's `getImageProps` with responsive `sizes` and a mobile `<source>` to
  keep the actual desktop/mobile vault screenshots, with art direction intact.
- Enable Next image optimization at quality 85 for both vault and extension
  images. Browsers can receive negotiated WebP and appropriate responsive widths
  instead of the original large PNG every time.
- Keep the primary screenshot eager/high-priority; keep the extension screenshot
  lazy/asynchronously decoded. Preserve width/height space and full-resolution PNG
  links. No screenshots were replaced with generated mockups.
- Restrict optimization to `/images/product/**` with no source query string.
  Arbitrary local account/vault routes and remote URLs are not eligible. No remote
  image host permission or relaxed CSP was introduced.

### Font delivery

- Generate a 105,772-byte Latin subset from the existing 352,240-byte Inter source
  using fontTools 4.67.0, retaining variable axes, available layout features,
  hinting, naming and license metadata. The original source/license remains.
- Preload the subset; load the original full font for complementary character
  ranges on demand. `--font-body` composes the two faces so components still use
  the same variable. Plus Jakarta Sans is unchanged.
- The source Inter request is approximately **246 KB smaller** for Latin-only
  pages; initial combined font assets fall from 412,852 to 166,384 bytes before
  HTTP headers. Non-Latin content can still need the original full font.
- Commit the generated WOFF2. Python/fontTools is an optional maintenance tool,
  not a build/CI/runtime requirement. The checked-in script verifies the upstream
  source hash before regenerating. See `src/app/fonts/README.md` for provenance.
- Existing self-hosting and `font-src 'self'` remain. Tests verify a Greek/Cyrillic
  sample requests the original font from the same origin on demand.

### Animation and accessibility

- Keep hero entrance movement and the animated underline, but stop beginning
  above-the-fold content at opacity zero. Important text/images are visible at
  first paint, while short movement still plays. Below-fold reveals, hover/press
  interactions and reduced-motion behavior remain.
- A repeat audit isolated large cached-image render delay during the screenshot
  container's entrance animation. Remove the entrance from that critical image
  container; keep text/underline motion and lower-page interactions.
- Increase contrast of small supporting labels, captions, numbers, notes and
  footer text. Use a slightly darker coral for white-text primary buttons and
  darker olive for the final CTA. Preserve the established pastel palette.
- Insert explicit whitespace between the visible brand's two words so its
  accessible name includes its visible text. Retain the existing home label.

## Security and retained limits

Per-response nonce CSP, dynamic rendering and `Cache-Control: no-store` remain.
Do not trade them away to remove a bfcache warning or make protected pages static.
No login, cookies, MFA, vault crypto, permission rules or API architecture changed.
No private authenticated page was audited or cached through the image optimizer.
Some framework JS/polyfill warnings may remain; removing required framework code
or browser compatibility merely to improve a score is outside this change.

Image optimization adds cold CPU/cache work on the web host. Repeat checks with
both cold and warm image caches, and test the real deployment's image endpoint
and caching behavior. Local scores vary with machine load and are lab evidence,
not field Core Web Vitals or guaranteed production scores.

## Validation and reproduction

```powershell
npm run lint --workspace=web
npm run build --workspace=web
npm run test:security --workspace=web
```

The production browser suite verifies optimized art-direction source selection,
image loading states, no password-manager API/third-party requests, fallback font
loading, no-JS/reduced-motion use, mobile overflow, auth/vault security flows and
rejection of `/vault` as an image-optimization source.

For your own deployment, rerun Lighthouse in Chrome DevTools in a clean browser
profile, using the same desktop/mobile settings and route before comparing.
Export JSON/HTML locally; compare several runs rather than one noisy score.

Example optional CLI commands (supported Node runtime and Chrome required):

```powershell
npx lighthouse@13.5.0 http://127.0.0.1:4178 --chrome-flags="--headless" --output=json --output=html --output-path=apps/web/.lighthouse/mobile
npx lighthouse@13.5.0 http://127.0.0.1:4178 --preset=desktop --chrome-flags="--headless" --output=json --output=html --output-path=apps/web/.lighthouse/desktop
```

## Sources

- [Lighthouse overview](https://developer.chrome.com/docs/lighthouse/overview/)
- [Next Image/getImageProps](https://nextjs.org/docs/app/api-reference/components/image)
- [fontTools subsetting](https://fonttools.readthedocs.io/en/latest/subset/index.html)
