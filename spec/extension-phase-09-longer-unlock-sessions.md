# Phase 9 — Longer unlock sessions

Status: implemented following the user's request to continue with longer sessions
and filling without the popup. This supersedes Phase 3's popup-only ownership.

## Behavior and tradeoff

The default is five minutes of inactivity. Settings also offer fifteen minutes
or locking when the popup/chooser closes. Every session has a one-hour absolute
limit and cannot outlast the authenticated server session. Only explicit
interaction in extension UI, successful authorization/fill, or a policy change
extends inactivity. Status polling, background pages, and website activity do not.

Keeping a vault unlocked increases the time its decrypted contents are in memory
compared with locking on popup closure. No vault password, vault key, decrypted
entry, or session token is written to local/sync storage, session storage, or
IndexedDB. JavaScript drops references on lock; it cannot promise physical memory
erasure by the garbage collector. Non-extractable CryptoKey is retained only in
the dedicated crypto worker, with the same shared Argon2id/AES-GCM implementation.

## Architecture

- `src/session/crypto.worker.ts`: real dedicated worker owns the existing
  `VaultSession`, derives the key, decrypts and encrypts entries locally.
- `src/session/owner.ts`: inactivity and absolute/session deadlines; cancels late
  unlock completions and authorizes exposures/updates against the real session.
- `offscreen.html`, `src/session/offscreen.ts`: extension-owned offscreen host for
  this worker, using the genuine `WORKERS` reason. Routes messages and handles
  worker failure; contains no page-facing resources or UI.
- `src/background/session.ts`: creates the offscreen host on demand, checks
  readiness, and forwards only validated commands. Retries readiness probes,
  never unlock or write commands.
- `src/popup/vault/remote.ts`, `useVault.ts`: popup/chooser clients keep transient
  rendering copies, never a key. Closing discards those copies without destroying
  the shared unlocked session, unless popup-only locking was selected.
- `src/messaging/session.ts`: strict bounded schemas and packaged UI allowlist.

The MV3 background service worker may suspend normally. Its restart reconnects
to the same offscreen worker. No ports, alarms, periodic pings, or fabricated
activity are used to keep it alive when UI is closed. The offscreen document
performs actual dedicated-worker cryptography, not generic background persistence.
Its destruction, browser restart, extension reload, or crypto worker failure
loses the in-memory key and requires unlocking again.

All API requests still use the existing background broker and HttpOnly cookie
model; only cipher envelopes go to vault endpoints. The worker does not make
independent cross-origin fetches. Authentication is checked on reopening,
authorization, and writes. Website-side logout/account changes are discovered
at the next server validation; no immediate server-push revocation is claimed.
The open UI also retains its existing authentication checks.

Local storage contains only `lockPolicy` and explicitly enabled website origins.
The deadline is checked on every operation and local credential read, in addition
to an expiry timer, so sleep or timer throttling cannot authorize expired access.
Polling while UI is open observes state; it does not count as activity.
Manual lock/logout invalidate in-flight unlock operations and clear captures and
pending chooser requests. Popup-only close locking uses best-effort pagehide
delivery plus the inactivity safety deadline if a renderer crashes.

## Compatibility

No backend, cookie, database, encryption format, or shared cryptographic algorithm
changes are needed. Minimum Chrome version remains 120; Edge must support the
same offscreen API. Reload the unpacked extension to accept its manifest changes.
`offscreen` allows the crypto worker host; `storage` stores only nonsecret settings
and the Phase 10 memory-only target ticket.

## Testing

```powershell
npm run build:dev --workspace=extension
npm run test --workspace=extension
npm run test:browser --workspace=extension -- tests/browser/vault.spec.ts
```

Unit tests cover independent popup clients, inactivity without activity, explicit
activity, the absolute maximum, authenticated session expiry, server failures,
unverified/account changes, delayed unlock cancellation, owner destruction, stale
UI replies, malformed commands, and content/page sender boundaries.

Browser cases exercise real packaged Argon2/AES compatibility, MV3 worker
suspension, popup reopen, manual lock, profile changes, session expiry, failed
logout, wrong passwords, popup-only policy persistence, and offscreen destruction.
Storage inspection verifies no secret persistence.

Manual Chrome/Edge checks: unlock and close/reopen; wait five minutes with no
extension interaction; test fifteen-minute and popup-only settings; sleep past
the deadline; restart/reload and confirm locked. Policy persists; unlocking does
not. Changes made in the web vault still require lock/unlock to refresh entries.

## Validation record — 2026-10-11

- Extension unit suite: 245 passed across 13 files.
- Complete Chromium browser suite: 46 passed in one run, including the real
  HttpOnly cookie fixture and third-party-cookie blocking configuration.
- Extension TypeScript check and development/production bundles passed.
- No sensitive console logging, secret storage, page `window.postMessage`, or
  unsafe eval added. The dedicated worker's own `postMessage` is internal to
  the extension and does not communicate with a website.
- Startup readiness, expired-session notices, in-flight cancellation, and
  shortened server expiry were corrected during validation.
- Native Chrome/Edge toolbar, shortcut/menu, idle/sleep behavior, and optional
  permission prompts remain manual checks described above.
