# Implementation progress

Updated 2026-11-04. This is an incremental implementation, not completion of the full product roadmap.

## Repository inventory

Workspaces: `apps/web` (Next App Router), `apps/api` (Hono), `apps/extension` (Vite MV3), `packages/shared` (Zod and generator), `packages/crypto` (Argon2id/AES-GCM). Root Vercel Services configuration hosts web/API. No root or application AGENTS.md was found; the AGENTS files under unrelated video output directories do not govern application work. Existing untracked video output was left untouched.

| Feature | Status | Work required |
| --- | --- | --- |
| Registration, login, verification, sessions, account settings | Fully implemented; existing test coverage | Web/API |
| Separate account/vault passwords, verifier, atomic key rotation | Fully implemented | Preserve crypto compatibility |
| Credential CRUD, generator, copy/reveal, lock | Implemented but needs improvement | Web/extension |
| Exact-origin matching, active tab, multi-account autofill, suggestions | Implemented but needs improvement; manual browser coverage remains | Extension |
| Confirmed save/update, opt-in encrypted capture, multi-step form detection | Partially implemented; supported-form limits documented in extension README | Extension |
| List/grid and alphabetical/recent sorting | Partially implemented in this increment | Web |
| Favorites, folders, tags | Partially implemented: optional encrypted fields, form editing and web filters; no folder manager or extension controls yet | Shared/web/extension; no migration |
| Search | Implemented but needs improvement: web now includes folders/tags | Shared/web/extension |
| Credential details | Partially implemented: web cards/edit, extension detail panel | Web |
| CSV migration, mapping, duplicate review, export/restore | Missing | Shared/web/tests |
| Manual extension distribution | Partially implemented: production ZIP build, installation tabs, landing CTA; live release not deployed | Build/web; hosting verification |
| Offline encrypted snapshots and sync conflict UI | Missing; existing revision/salt guards and conditional writes are prerequisites | Shared/web/extension/API; evaluate metadata migrations |
| History, trash and restore | Missing | Shared/web/extension; evaluate server deletion metadata |
| Expanded item types | Missing | Shared discriminated payload design first |
| Keyboard shortcuts | Partially implemented: extension Alt+Shift+L | Web/extension |
| 10/100/1000/5000 performance measurements | Missing | Benchmark/test tooling |
| Interaction feedback | Partially implemented: existing async states/copy checkmarks/skeletons; navigation bar and broad action review pending | Web/extension |

## Changes completed in this increment

- Account registration/change and vault creation/change minimum reduced from 15 to 10 Unicode characters; existing login/unlock checks preserved. No reset flow was found. Saved website passwords remain valid at one character; generator minimum was not 15 and is unchanged.
- API registration/password change reuse a shared new-password schema. Boundary tests cover 9, 10, longer, Unicode, and oversized input.
- Optional encrypted favorite/folder/tags fields preserve legacy payload compatibility; web forms read/write them, web search includes them, folder/tag/favorite filters and alphabetical sorting added.
- Remember only layout in localStorage. Compact list includes icon/title/account/hostname/date/delete and edit navigation. Existing grid and copy/reveal behavior preserved.
- Guard repeated web create/edit/delete while pending. Show delete failure instead of only logging it.
- Production extension package script builds MV3, validates required entries, includes only allowed built assets, writes deterministic ZIP entries with manifest at root. ZIP and release metadata go to ignored web public downloads. Web prebuild generates artifacts rather than committing them.
- `/extension` provides Chrome/Edge tabs, copyable management URL, seven installation steps, manual-install warning, troubleshooting, version/date and update guidance. Landing browser section links to it.
- Fixed existing lint failure caused by unqualified btoa in a web browser fixture.

## Architecture decisions

No database migration or cryptographic derivation change. Organization data lives inside existing ciphertext. Existing extension password updates spread existing decrypted entries, preserving organization metadata. Folder names are currently per-entry strings: renaming/deleting an entire folder and retaining empty folders are not implemented. Favorites are edited via the form rather than an optimistic list toggle. Recently used sorting needs an explicit usage-metadata design. No offline writes added.

## Verification

- API Vitest: 9 files, 107 tests passed.
- Extension Vitest: 21 files, 363 tests passed, including five new product-policy tests.
- ZIP checked independently using Python zipfile: 18 files, CRC passed, manifest at root, MV3, referenced background/popup present, no env/source/map files.
- Typecheck, lint and production build final outcomes recorded below after execution.
- No production deployment, production database operation, real credentials, email delivery, native Chrome/Edge installation or live backend mutation performed.

## Remaining work

Finish Phase A organization management, detail view and extension parity; then implement B CSV import/export with reviewed formats and encrypted portable backup; verify C actual browser flows; improve D capture/generator ergonomics; design E owner-bound verified encrypted snapshot and conflict behavior; implement F encrypted history/trash before expanded types. Add navigation progress, broader action feedback and end-to-end vault/migration tests. Run measured performance fixtures before introducing virtualization. These phases remain pending, not externally blocked.

## Run locally and release

Use Node 24 and `npm ci`. Configure existing API/web env files per `.env.example` and DEPLOYMENT.md. `npm run dev` starts web and API. `npm run build:dev --workspace=extension` creates a localhost extension; load apps/extension/dist through Load unpacked. `npm run extension:package` builds production against the documented production API (override with HTTPS VITE_API_ORIGIN). It writes apps/web/public/downloads/password-manager-extension.zip and extension-release.json. `npm run build` also generates this artifact before Next builds. For local dev downloads, run packaging explicitly first. Visit /extension for installation. Production serving still requires the normal separately authorized deployment.

For releases, update apps/extension/package.json and manifest.ts versions together, run packaging and tests, inspect the ZIP, then use the existing preview/deployment workflow. Manual installations update by replacing extracted files and Reload. API must allow the manifest's existing extension identity in EXTENSION_ORIGINS; see DEPLOYMENT.md. This increment does not alter live configuration.

Final checks: root npm run typecheck passed for API/web/extension; npm run lint --workspace=web passed; root npm run build passed including production extension and Next routes. Rollup emitted non-fatal third-party Zod annotation warnings. Browser E2E was not run in this increment. The generated release has not been deployed, so the live download URL is not yet verified.


## Build and audit repair (2026-11-04)

User paused feature work and removed import/export and offline access from the future scope. Earlier roadmap references to these features are historical, not active tasks.

- Production extension build now checks `tsconfig.build.json` (runtime source, manifest and Vite config). Full `typecheck` still includes all tests and remains required separately in GitHub CI. This prevents website packaging from depending on API/web imports used only by extension tests.
- ZIP build uses npm's CLI with the same Node executable as the parent process, avoiding a shell where npm provides its CLI path. Build failures remain fatal; no TypeScript checking or audit gate is disabled.
- Root override pins minimatch 11.0.4. Updated only its lockfile subtree (including brace-expansion, balanced-match and nonrecursive-glob-match), preserving other dependency versions. Existing ESLint uses the supported Minimatch constructor; the enabled React no-danger rule uses no custom glob patterns.
- Audit after lockfile repair: zero vulnerabilities at moderate threshold. Final clean-install validation follows.
- The provided deployment excerpt omits the original TypeScript diagnostics. Local full typecheck and production build passed; an exact match to the original remote failure cannot be claimed. Linux runtime validation requires CI/Vercel (local Docker daemon and WSL unavailable).

Final repair verification (Node 24.22.1): clean npm ci --ignore-scripts --no-audit passed; npm audit --audit-level=moderate reports zero vulnerabilities; web lint passed; root typecheck passed for all workspaces; root production build passed including extension ZIP and Next.js. API 107/107 and extension 363/363 tests passed in a final sequential run. An earlier concurrent run hit a PGlite 10-second setup timeout; sequential rerun passed without changing test timeouts. ZIP CRC and MV3 manifest validated independently. git diff --check passed. No deployment performed.


## Follow-up: confirmed Vercel failure and onboarding regression

The earlier production TypeScript split was insufficient. Read-only Vercel CLI
inspection of deployment daues30j7 showed TS2688 for chrome and node type
libraries. The install had not made these build-time types available to the
extension workspace. Frontend service now explicitly installs all workspaces
including devDependencies. CI uses the identical command from apps/web with
NODE_ENV=production. No audit gate or typecheck was removed.

The stale onboarding browser assertion still expected "at least 15". It now
checks a nine-character fixture is rejected, creates a vault using exactly ten
characters, and verifies a returning unlock with that ten-character password.
Actual Playwright onboarding test passed against the local production build.
The configured install command also passed npm's dry-run from apps/web with
NODE_ENV=production; full hosted installation still requires a new deployment.

Git investigation: all seven prior repair files were already committed in
d74540a (Prod fix); the worktree was clean at the start of this follow-up.
`git add .` produces no output normally and has nothing to stage when files
match HEAD. This follow-up's files are left unstaged for review.

Follow-up final verification: root production build passed (extension source typecheck, Vite ZIP packaging, Next build/typecheck); web lint passed; onboarding and registration Playwright browser scripts both passed against the fresh production build; git diff --check passed. Hosted redeployment was not performed.


## Second install correction: explicitly leave the web workspace

Deployment r8xaqxbjr (commit d3fa87b) confirms the previous service install ran,
but only added 331 packages and extension TS2688 still reported missing chrome
and vite/client. GitHub likewise could not find the API's vitest executable.
The prior dry-run on a populated local tree did not establish a clean install.

Vercel's frontend install now explicitly changes from apps/web to the monorepo
root before npm ci --include=dev. CI no longer sets working-directory: apps/web;
it installs from the checkout root. This replaces the insufficient nested
workspace flag approach. No validation gate, typecheck or test is disabled.

Verification is being performed in an isolated archive of tracked application
sources, without pre-existing node_modules or environment files, using Node 24
and NODE_ENV=production for installation. Outcomes recorded below.

The first isolated install on the system temp drive failed with ENOSPC (C: had zero free space). Its verification directory was removed and the clean check restarted on D:. This was a local verification failure, not a Vercel error.

Isolated root-install verification completed successfully on Node 24.22.1 in D:/Projects/password-manager-install-verification-0d6ee613: fresh npm ci --include=dev with NODE_ENV=production installed 427 packages and audited 433 with zero vulnerabilities. Chrome types, vite/client and vitest were present. In that same checkout, API 107/107 and extension 363/363 tests passed; root production build (extension, ZIP, Next) passed; all workspace typechecks and web lint passed. This supersedes the earlier nested-workspace dry-run evidence. No hosted deployment performed.
