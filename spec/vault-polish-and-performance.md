# Vault polish, recovery and performance

## Scope

Implements the current items 1–7 with the user's later UI correction: cards only,
per-card favorite toggles, and three compact sections (All, Favorites, Trash).
There are no view/sort dropdowns or folder/tag inputs. Existing encrypted
organization metadata is retained during edits, rather than deleted.
Import/export, offline access and additional item types are excluded.

## Behavior

- Card titles open a native modal detail view: username/email, safe website link,
  reveal/copy controls, notes, dates, favorite and edit actions.
- Favorites update immediately, disable repeated writes, and roll back on error.
  Changes use account/salt guards and conditional ciphertext comparisons.
- Copy controls announce success and errors. Dialogs trap focus natively, support
  Escape and restore focus. Destructive operations require confirmation.
- Login/registration/unlock/edit controls expose busy state and reject repeated
  submissions. Existing loading text and layout-shaped skeletons are retained.
  Visible focus and reduced-motion rules cover website and popup controls.
- Delayed thin progress feedback covers internal link navigation and completes
  on App Router pathname changes; instant transitions avoid a flashing loader.
- Press / outside inputs/dialogs to focus vault search.
- The popup supports favorites and bounds rendered results, preserving active
  site matching and explicit autofill. Existing autofill/copy/error feedback
  remains intact.

## Encrypted recovery

Optional encrypted payload fields: `deletedAt` and `history`. Legacy records
remain valid. Ten previous content versions are retained; snapshots do not
recursively embed history. Favorite/trust-only changes do not create versions.
Restore deliberately restores content fields, including removing fields absent
from the old version. Current organization and login-origin approvals remain
unchanged. History can be explicitly cleared with confirmation.

Delete moves an item to Trash. Restore is available in its detail dialog.
Trash has no automatic expiry. Permanent deletion requires a separate explicit
confirmation and checks the current encrypted payload is still trashed, with an
atomic ciphertext comparison. Older bodyless DELETE callers remain compatible.
The server still receives ciphertext, never plaintext recovery contents.

The API exposes the already-existing vault revision in authenticated profiles.
Extension 0.2.0 invalidates an unlocked snapshot when an external revision is
observed during session reconciliation or authorization, preventing stale fills.
It explains that unlocking is required to fetch the updated vault. This is a
conservative invalidation strategy, not background merge or offline sync.

Update manually installed extensions to 0.2.0 and reload before using Trash.
Older clients do not understand trash markers. Currently unlocked older snapshots
also require locking/reloading. The website's existing extension guide and new
ZIP remain the distribution path. Version bumped in manifest, package and lockfile.

## Measured performance

Node 24.22.1; local production Next build and Chromium with synthetic encrypted
credentials and mocked HTTP API responses. Single-run measurements, not SLAs.
Unlock/load numbers include network fixture delivery, crypto and UI work; they
are not isolated cryptographic CPU timings. Heap is CDP JSHeapUsedSize after
search, not peak memory, total process RSS or worker memory.

Before bounding rendered cards, 5,000 records took 9,562 ms through initial
unlock/load/render and 1,193 ms for search/removal of the rendered results.
Rendering is now limited to 60 results initially, with Show more. Search still
covers the entire decrypted vault. No virtualization or new caching infrastructure.

| Entries | Web unlock/load/render ms | Web search/render ms | Web JS heap bytes |
| ---: | ---: | ---: | ---: |
| 10 | 722 | 27 | 12,704,676 |
| 100 | 802 | 78 | 15,807,452 |
| 1,000 | 1,162 | 81 | 22,060,252 |
| 5,000 | 2,972 | 61 | 50,094,508 |

| Entries | Popup open ms | Popup unlock/load ms | Popup search ms |
| ---: | ---: | ---: | ---: |
| 10 | 689 | 1,693 | 72 |
| 100 | 465 | 2,021 | 74 |
| 1,000 | 319 | 2,088 | 68 |
| 5,000 | 374 | 3,411 | 98 |

Popup measurements use a packaged development MV3 build and isolated Chromium
profile; subsequent openings reuse the browser process. Real hosted API latency,
large varied records and manual Chrome/Edge toolbar use can differ.

## Files/packages and deployment

Web: vault page/cards/form/sidebar, shared dialog/copy/progress controls, detail
view, conditional mutation helper, login/register busy guards, regression script.
API: authenticated revision metadata, optional conditional DELETE validation,
atomic delete comparison. Shared: backward-compatible recovery fields/helpers.
Extension: popup/session/remote models, profile/snapshot validation, revision
invalidation, favorites, capped result rendering, version 0.2.0 and tests.
CI: one added web regression step. Web package: one added test script.

No database migration. No cryptographic format/KDF change. No new app dependency.
Install commands, vercel.json and release-packaging build logic are unchanged.
No deployment, production data operation or credential modification performed.

## Verification/run commands

- npm test: API 107, extension 372 tests passed.
- npm run typecheck: API, website and extension passed.
- npm run lint --workspace=web: passed.
- npm run build: production extension package and Next build passed.
- Existing web security, registration and onboarding browser scripts passed.
- npm run test:vault-experience --workspace=web: exercised encrypted creation,
  favorite conflict rollback/success, details/reveal/copy, Escape/search shortcut,
  Trash restore, content-version restore and removal of old controls.
- Extension Chromium full suite initially passed 72/73. The approval scenario
  exposed unnecessary permission-history recording, which was fixed; its targeted
  rerun passed. Additional external-revision and four-size popup performance
  scenarios also passed in Chromium. No claim of a single clean full-suite rerun.
- Desktop and 390px mobile screenshots visually reviewed.

Use Node 24 and the existing env examples. npm run dev starts website/API.
New browser regression is included in existing CI. To repeat the web benchmark,
set VAULT_BENCHMARK=1 and run the vault-experience test after npm run build.
The popup benchmark is tests/browser/performance.spec.ts in the extension suite.
Use npm run build:dev --workspace=extension for localhost unpacked use; use
npm run extension:package for the production ZIP. Update/reload manual installs.

Manual native Chrome/Edge release sign-off and real-network performance remain
outside this local verification. The revision strategy intentionally asks users
to unlock after an external change; it does not merge live edits in memory.
