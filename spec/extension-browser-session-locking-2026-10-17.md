# Extension lock policies - 2026-10-17

Status: implemented. Supersedes Phase 9's five-minute default and universal
one-hour local unlock limit.

## Settings and behavior

In the extension, open Settings and use **Lock the vault**:

| Setting | Behavior |
| --- | --- |
| When the popup closes | Existing popup/chooser-close mode; five-minute crash safety timer. |
| After 5 minutes of inactivity | Existing short timer. |
| After 15 minutes of inactivity (default) | Default when no valid preference is saved. |
| After 30 minutes of inactivity | New longer timer. |
| Until browser closes | No local inactivity timer or one-hour local cap. |

Existing valid preferences are preserved. Only the selected policy is saved in
`chrome.storage.local`; selecting a policy never saves a password, key, or
decrypted entry. Popup closure discards its rendering copies; the dedicated
crypto worker retains the non-extractable key in memory in timed/browser modes.

Timed modes retain their one-hour absolute maximum. Returning from browser mode
to a timed mode restores the cap measured from the original unlock: after one
hour this locks immediately and requires a fresh unlock. Polling does not count
as activity. Existing explicit extension activity/authorization rules remain.

## Browser closure and security boundaries

Closing the last normal browser window clears pending captures, suggestions,
and fill choosers, and destroys the offscreen document hosting the crypto worker.
An extension chooser or Chrome's background-app mode cannot keep the vault
unlocked after all normal windows close. Closing one of several normal windows
does not lock it. Browser restart, computer shutdown, extension reload, and loss
of the crypto worker lose the in-memory key. Browser resource reclamation can
therefore lock earlier than browser closure; no persistence workaround is used.

Manual lock, sign out, account/key-version changes, and authentication failures
still clear the vault. The browser option does not disable API authorization:
the existing API session has a 24-hour absolute expiry and 30-minute inactivity
limit. Absolute expiry is also a local deadline; server-side inactivity expiry
or revocation is discovered on the next authentication check (such as reopening
the popup or filling). No periodic API keepalive or backend timeout change was
introduced. An expired account session requires signing in again.

Browser mode keeps decrypted data available longer on an unattended computer.
Use a timed option on a shared machine. Computer sleep/screen lock is not a
shutdown and is not claimed as an automatic lock event in browser mode.

The session bridge invalidates in-flight requests before destroying the owner,
waits for an already-started creation before closing it, and drops late replies
so a delayed unlock cannot restore plaintext after browser closure.

## Files

- `apps/extension/src/messaging/session.ts`: strict policy schema and shared default.
- `apps/extension/src/session/owner.ts`: policy-aware deadlines and transitions.
- `apps/extension/src/session/crypto.worker.ts`: shared default at worker startup.
- `apps/extension/src/background/session.ts`: owner destruction and late-reply guard.
- `apps/extension/src/background/browserLock.ts`: normal-window closure boundary.
- `apps/extension/src/background/index.ts`: clear captures/suggestions/fill state.
- `apps/extension/src/popup/vault/remote.ts`: shared UI default.
- `apps/extension/src/popup/UnlockSettings.tsx`: options and tradeoff explanation.

No API, database, migration, encryption-format, or manifest-permission changes.
Chrome's [Windows API documentation](https://developer.chrome.com/docs/extensions/reference/api/windows)
defines the normal-window query and window removal events used here.

## Validation and manual testing

```powershell
npm run test --workspace=extension
npm run build:dev --workspace=extension
npm run test:browser --workspace=extension -- tests/browser/vault.spec.ts
npm run test:browser --workspace=extension -- tests/browser/interactions.spec.ts
```

Validation: 354 unit tests, 13 vault browser tests, and 31 autofill/interaction
browser tests passed. Extension TypeScript checking and development build passed.

Unit coverage includes the fifteen-minute default, thirty-minute inactivity,
browser mode beyond one hour, session expiry/revocation, timed-mode transitions,
locked replacement owners, window boundaries, owner destruction, invalid stored
policies, and a pending unlock reply discarded after destruction. Browser coverage
checks real crypto, popup reopening, MV3 suspension, browser-mode preference-only
storage, and locking when all normal windows close while an extension window
keeps the process alive.

After building, reload the unpacked extension in Chrome/Edge:

1. Open Settings. A fresh preference defaults to fifteen minutes; existing
   choices remain. Select Until browser closes, unlock, close/reopen the popup.
2. Confirm the vault remains unlocked and shortcut/field account selection works.
3. Open two normal windows. Close one: vault remains unlocked. Close both, reopen
   the browser: vault must be locked (or require sign-in if its session expired).
4. Repeat with a browser restart/computer shutdown and with extension reload.
5. Select thirty minutes and leave extension interactions idle: it locks at the
   deadline. Popup polling or browsing a website must not reset the timer.
6. Check manual lock and sign out in browser mode. After thirty minutes with no
   authenticated API activity, the next fill/open must require fresh sign-in.
