# Follow-up: Longer unlock sessions and filling without the popup

Status: implemented after the user requested longer unlock sessions and filling
without the popup. See [Phase 9](extension-phase-09-longer-unlock-sessions.md)
and [Phase 10](extension-phase-10-fill-without-popup.md).

The original discussion below describes the decision points before implementation.
The chosen design uses a genuine dedicated crypto worker inside an offscreen host,
bounded inactivity/absolute deadlines, a trusted account chooser, and optional
exact-host page controls. No vault key or decrypted vault is persisted.

Currently the popup owns the vault key. Closing it locks the vault, so a page button or keyboard shortcut cannot fill from that closed vault. The submission watcher is separate: its temporary capture key cannot decrypt the saved vault.

For the later discussion, choose an extension-owned unlocked-session lifetime and owner first. Decide inactivity/manual-lock rules, account/session loss, browser/extension restart behavior, and what service-worker suspension should do. Keeping an in-memory owner alive and silently persisting a vault key are different security choices; raw vault keys must not go into local/sync storage or IndexedDB. Do not bypass Manifest V3 suspension with fabricated keepalive behavior.

Then design an inline Fill button or shortcut as an explicit user action. Content scripts may identify eligible fields but must never receive a vault key or an entire decrypted vault. Account selection/unlocking belongs to extension-owned UI, with only the chosen username/password sent to the verified top document. Website scripts must not receive the vault password. Reuse Phase 5 matching and Phase 6 tab/document/origin validation, including race checks, and preserve the rule against automatic submission.

An always-present inline control also needs a separate least-privilege website-permission plan; current activeTab grants begin only when the extension is invoked. No broad host permission or passive always-on watcher is assumed. Tests should cover forged requests, same-site multiple accounts, navigation, iframe/hidden-field attacks, lock/expiry/restart, and the failure path when no unlocked key exists.
