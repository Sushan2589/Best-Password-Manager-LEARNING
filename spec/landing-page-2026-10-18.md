# Public landing page

Performance follow-up: [Lighthouse improvements](landing-lighthouse-improvements-2026-10-18.md)
adds same-origin responsive image optimization, smaller initial font delivery,
contrast/accessibility corrections and visible-at-first-paint hero animations.
Full-resolution PNG screenshot links remain available.

Replaces the default Next.js/Vercel starter homepage with a public product page
for Password Manager. The existing name, coral accent, Inter body font and
Plus Jakarta Sans display font remain; no authentication or vault logic changes.

## Design

The visual direction draws on [Clerk](https://clerk.com/)'s product presentation
and [n8n](https://n8n.io/)'s playful product-led feel, without copying their assets
or wording. Warm off-white, dark ink and coral are paired with lilac, lime and
peach. Small tilted notes, fine borders, and a darker security panel add personality.
Following review, diagonal arrows, the starburst/asterisk shapes and orbit doodles
were removed. The two-stroke underline beneath "Off your mind" was restored on
request. Product visuals use actual screenshots.

The underline draws once on arrival, alongside short staggered entrances for the
hero copy and vault screenshot. Tour-link arrows and the security lock have subtle
hover motion. Below-fold content reveals once when it enters the viewport, using
a small client-side IntersectionObserver enhancement. Cards/steps stagger gently;
navigation underlines, button presses, card icons, screenshot borders and FAQ/menu
opening have subtle feedback. There are no looping animations or animation libraries.
Reduced-motion preferences disable animations, transitions and hover movement;
the underline and all content remain visible.

The observer disconnects after observing each item and cleans up on unmount. Content
is visible by default if JavaScript or IntersectionObserver is unavailable. Keyboard
focus skips reveal fades, and changes to reduced-motion preferences are respected.
The extension screenshot uses native lazy loading and asynchronous decoding, with
explicit dimensions to reserve space. The primary vault screenshot loads eagerly
at high priority; both images decode asynchronously. Lazy loading is browser-managed,
so browsers may prefetch the extension screenshot before it becomes visible.

Content covers the web vault, browser autofill, password generation, security,
getting started and common questions. Register/sign-in links use existing routes.
There are no invented testimonials, usage metrics, certifications, prices,
store listings, privacy/terms pages, or unavailable feature promises. The extension
is described as Chrome/Edge support, with explicit website permission, an unlocked
vault and account selection needed for filling. Store distribution remains outside
this change; no install button points to an unpublished store listing.

## Actual product screenshots

The hero shows the real web vault, and the browser section shows the real extension
popup. These are Playwright screenshots of the existing components, populated with
isolated encrypted sample accounts under reserved example/test domains. No real
account, live database or customer credentials were used. Passwords stay masked.
Desktop and mobile images use the appropriate actual UI layouts; the mobile vault
capture is scrolled to its credential cards. The extension capture is scrolled to
its saved-account list, retaining the actual header/footer.

The previous `ProductDemo.tsx` mock interface and its unused CSS were removed.
The landing page now has no sample password generation, clipboard or simulated
fill controls. Its product images are local static PNGs with descriptive alt text;
the hero image has a full-resolution link. No API, favicon-provider, or browser
permission requests happen when viewing the landing page.

To refresh the assets after changing the product UI, build the web app and run:

```powershell
node apps/web/scripts/capture-product-screenshots.mjs
```

The capture script starts its own production web server, injects encrypted fixture
API responses and compiles an isolated extension fixture into the ignored `.next`
directory. It launches temporary browser profiles. Web network access is restricted
to the local web server and mocked API; no Neon, email or external icon calls occur.
It saves two-times-density PNGs in `apps/web/public/images/product/`.

The FAQ and mobile navigation use native details/summary controls. Controls retain
focus outlines and reduced-motion support. Module-scoped landing CSS leaves the
actual application styling and security behavior in place.

## Files

- `apps/web/src/app/page.tsx`: server-rendered content and homepage metadata.
- `apps/web/src/app/landing.module.css`: responsive layout and visual system.
- `apps/web/src/app/components/landing/LandingMotion.tsx`: viewport reveal enhancement
  with observer cleanup and live reduced-motion handling.
- `apps/web/public/images/product/`: actual web/extension product screenshots.
- `apps/web/scripts/capture-product-screenshots.mjs`: reproducible fixture captures.
- `apps/web/src/app/layout.tsx`: replaces starter metadata with the product name.
- `apps/web/src/app/icon.svg`: local coral lock icon; removes the Next starter ICO.
- `apps/web/tests/security-browser.mjs`: landing interactions, navigation, mobile,
  console/runtime errors and absence of API/third-party requests, alongside the
  existing application security browser checks.

## Validation

```powershell
npm run lint --workspace=web
npm run build --workspace=web
npm run test:security --workspace=web
```

The browser script starts its own production Next server and mocks later app API
calls; no running API, Neon, or email delivery is needed. It saves desktop/mobile
viewport and full-page screenshots under `apps/web/.next/landing-*.png` for visual
review. These are ignored build artifacts. No real user information is used.

Production still needs real hosting origins, mail configuration and the deployment
checks in the security specs. This page is a product presentation, not a new
security certification or deployment sign-off.

Validation completed: web ESLint, production build (including TypeScript), and
the full existing production security-browser script passed. Landing images/navigation
were checked at 1440, 768, 390 and 320 pixels with no horizontal page overflow.
Desktop and phone landing screenshots were visually reviewed with the actual
vault and extension images in place. The image-source checks wait for the browser
to select a responsive image after viewport changes.
The browser checks confirm no landing-page API calls or third-party requests,
responsive real-product images, removal of diagonal-arrow/starburst artwork,
FAQ disclosure, mobile navigation and working registration/sign-in destinations.
The lazy-load/microinteraction update also passed web lint, production build and
the full security-browser suite, including explicit image-loading attributes,
no active animations under reduced motion and usable server-rendered content with
JavaScript disabled.
