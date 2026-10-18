# Basic API rate limiting

Implemented 2026-10-12 before the security attack review. Existing cookie authentication and vault encryption remain in place. Subsequent account/session security changes require the migration described in [the remediation report](security-remediation-2026-10-12.md).

## Limits

| Scope | Budget | Window |
| --- | ---: | --- |
| General API, per connection IP | 600 requests | 1 minute |
| Login, per IP | 60 attempts | 15 minutes |
| Login, per normalized account email | 10 attempts | 15 minutes |
| Registration, per IP | 5 attempts | 1 hour |
| Registration, per normalized account email | 3 attempts | 1 hour |
| Sensitive account actions, per IP | 60 attempts | 15 minutes |
| Sensitive actions, per authenticated account | 10 attempts | 15 minutes |
| Logout, independent per IP budget | 60 requests | 15 minutes |
| Verification-token submissions, per IP | 20 attempts | 15 minutes |
| Verification resend, per IP | 10 attempts | 15 minutes |
| Verification resend, per normalized account email | 3 attempts | 15 minutes |

Limits are independent, not a combined IP/email bucket. Changing IP does not reset an account's budget; changing account does not reset the IP budget. Account email identities are trimmed and lowercased **for throttling only**; existing authentication/email storage behavior is unchanged. All admitted attempts count, including successful logins. There is no permanent database account lockout or counter reset on successful login.

Responses are HTTP `429`, a generic JSON error, `Cache-Control: no-store`, and a positive seconds-valued `Retry-After`. CORS exposes `Retry-After` to approved clients. The web login now distinguishes throttling from an incorrect password; the extension already understands `429`. OPTIONS requests bypass limits. Logout bypasses ordinary quotas but has its own 60-per-IP/15-minute budget and two reserved concurrency slots. It still requires an approved Origin. Two concurrent Argon2 operations and 16 ordinary API operations are admitted; excess work returns `503` with `Retry-After: 1`.

## Implementation

`apps/api/src/middleware/rateLimit.ts` provides a bounded, fixed-window, single-process memory store. IP checks run before body parsing. Account checks run after bounded JSON parsing but before authentication/hash/database/email work. The store keeps HMAC identities using an ephemeral random secret, not raw email addresses or IPs. Expired entries are swept periodically. At 10,000 active buckets it rejects new keys rather than evicting a victim's active quota. Existing keys still retain their budgets. Blocked attempts do not extend their bucket's window.

The real Node connection IP is authoritative by default. Client-supplied `X-Forwarded-For` is ignored unless the immediate peer appears in `TRUSTED_PROXY_IPS` and the header contains exactly one valid IP. A configured proxy **must overwrite**, not append, this header. Comma-separated chains are rejected as forwarding identities and fall back to the peer IP. The backend must also be protected from direct bypass of the intended proxy. IPv4-mapped IPv6 peer addresses must be configured exactly as observed.

No proxy trust is enabled by default. Set the configuration only after reviewing the actual deployment network. Incorrect configuration can group all users behind one proxy into one quota.

`apps/api/src/app.ts` separates application construction from server startup so the same production middleware can be tested without opening a real database or mail service. `index.ts` still starts the existing Hono Node adapter on port 3001. Tests inject persistence/mail fixtures; runtime uses the existing services.

## Limits of this baseline

Memory counters reset on process restart and are independent across replicas. Fixed windows permit boundary bursts. Shared NATs can throttle several legitimate users together; IPv6 address changes bypass the IP dimension, although account quotas remain. Targeted account requests can temporarily deny a legitimate login. Store saturation fails closed and can affect availability. This is not DDoS protection, MFA, a bot detector, or protection against offline guessing of stolen ciphertext.

Update 2026-10-18: [Arcjet integration](arcjet-integration-2026-10-18.md) now adds
shared sliding-window enforcement of these policies when enabled. The local
fixed-window layer remains. No Redis dependency was introduced. Keep one API
instance with private durable revocation storage: Arcjet does not solve the separate
session-revocation state requirement. Tune budgets against actual traffic,
particularly the extension's session polling.

## Verification and use

Restart the API to enable middleware. The rate limiter itself needs no schema change; the accompanying account/session security fixes require the migration linked above.

```powershell
npm run test --workspace=api
npm run typecheck --workspace=api
```

The suite includes concurrent guessing, IP-header spoofing/password spraying, independent account quotas across IPs, window expiry, bounded-store saturation, configured-proxy parsing, logout under exhausted quota and a real loopback HTTP burst through the Node adapter. No production database/email calls are made. See [the full report](security-report-2026-10-12.md) for findings and residual risks.

Reference: [OWASP login throttling guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).
