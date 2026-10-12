# Sensitive logging review — 2026-10-12

## Result

No sensitive application console output was found in the current source. No application code changes were needed for this review; previous logging cleanup remains effective.

## Scope and checks

- Searched web/API/extension/shared/config sources for console calls, console references/aliases, logger configuration, debug output, stdout/stderr writes and inspection helpers. Dependency directories, generated builds and browser artifacts were excluded.
- An additional TypeScript syntax-tree scan inspected 131 JavaScript/TypeScript source/config/script files outside test directories, identifying 41 direct console calls.
- 39 calls emit fixed status/error messages without dynamic arguments. They do not serialize caught exceptions, request/response bodies, profiles, passwords, generated passwords, ciphertext, decrypted entries, salts, vault keys, verification tokens, MFA secrets/recovery codes or session cookies.
- The two dynamic calls were reviewed manually: API startup prints only its localhost port; `securityLog` serializes only a fixed event category, random event ID and timestamp, bounded to ten emitted events per category per minute. It does not accept a payload or exception argument.
- No console calls were found in extension application code or shared packages. Development database/email/key test scripts print fixed status messages rather than records, cryptographic material or SDK responses. These scripts were inspected, not executed.
- Existing test output was reviewed separately: its console status lines are fixed messages. Tests use public fixtures and intercepted services.

## Verification

The existing API regression test injects a database exception containing secret-like strings and confirms they do not reach console output or the response. All 28 tests in the API security test file passed during this review, including that logging regression. They run entirely against fixtures, without Neon queries or email delivery:

```powershell
npm run test --workspace=api -- tests/security.test.ts
```

This is an application-source review. It does not establish the behavior of external hosting/proxy/access logs or dependency internals. Keep request bodies, Cookie/Authorization headers and verification URL tokens out of those logging configurations as well.
