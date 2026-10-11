# Extension testing checklist

## Build and automated checks

From the repository root, with dependencies installed:

```powershell
npm run typecheck --workspace=extension
npm exec --workspace=web -- tsc --noEmit
npm run extension:test
npm run build:dev --workspace=extension
npm exec --workspace=extension -- playwright install chromium
npm run test:browser --workspace=extension
```

Browser UI tests use the development `apps/extension/dist` build. Other browser fixtures build isolated bundles against mocked API responses or a local Hono fixture. No Neon or email access is needed for these tests. Headless tests simulate the global website permission in their generated test manifest only; production mandatory host access remains API-only. Run native permission checks manually.

For development, start the existing API/web services with `npm run dev`. Set `apps/extension/.env.development.local` using the existing environment example if the API is not at the default development address. Production builds use the configured production API origin.

## Reload the installed extension

1. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
2. Load unpacked `apps/extension/dist`, or press Reload on the existing installation after rebuilding.
3. Refresh open login pages so they receive the updated content script. Reloading the extension clears the unlocked memory session; sign in/unlock again as needed.
4. In extension Settings enable **Enable suggestions on all HTTPS websites**, and accept the native permission prompt. Choose a five- or fifteen-minute unlock policy to test filling with the popup closed.
5. Check shortcut conflicts at `chrome://extensions/shortcuts` or `edge://extensions/shortcuts`. The default is **Alt+Shift+L**.

Use dummy credentials for local/fixture tests. Do not submit dummy values on a real website.

## Manual pass criteria

| Check | Expected behavior |
| --- | --- |
| Sign in, verified/unverified account | Verified account can unlock; unverified account remains restricted. |
| Wrong vault password | Unlock fails; credentials stay unavailable. |
| Normal two-field login (including Vidya Nepal) | Clicking either field offers matching accounts; selecting one fills username and password, with no submission. |
| Shortcut | Alt+Shift+L opens the extension chooser and fills the selected supported form. |
| Multiple accounts | All matching accounts appear; only the selected account is filled. |
| Multiple/dynamic forms | Focused form is selected, or chooser requests a form choice; unrelated forms remain unchanged. |
| New HTTPS site after global setup | Suggestions appear without per-site setup when the markup is supported. Unrelated credentials are absent. |
| Missing/restricted site permission | Open the extension or use the shortcut. **Allow website access** requests the current host; decline leaves suggestions disabled. Browser policy restrictions may still prevent access. |
| Google root versus login host | Save a credential with website `https://google.com`, visit `https://accounts.google.com`, then open the popup/shortcut or choose **Review login website**. You can also select the account from All credentials and approve in credential details. Both addresses are shown. Nothing fills before approval. |
| Explicit approval | Check **I recognize and trust this login website**, then **Approve login website**. Account becomes available; a separate account selection fills it. |
| Approval persistence | Lock/unlock or reload/unlock. The account still matches the approved login address. Web editing must preserve that approval. |
| Approval removal | Open credential details → **Approved login websites** → **Remove**. Refresh the login page; the account no longer matches the removed address. |
| Username-first login | On a supported email/username form, select an account. Only that step fills. Click Next yourself. On the password step, select the account again. No automatic navigation or submission. |
| Phishing-like domains | `google.com.evil.com`, `accounts.google.com.evil.com`, `notgoogle.com`, and arbitrary unapproved subdomains show no matching Google account or approval hint. Automated fixtures cover these without visiting those domains. |
| HTTPS/ports | HTTP is rejected; approving one HTTPS port does not approve a different port. |
| OTP, signup, change-password form | Saved login autofill is unavailable for unsupported/ambiguous fields. Password generation and explicitly reviewed save tools remain separate. |
| Cross-origin iframe/action | No credentials enter a child-frame login or a form posting to another origin. |
| Close popup | With a timed policy, suggestions keep working until expiry; with popup-close policy, vault locks. |
| Manual lock/logout/expired session | Fresh suggestions and fills fail; existing account picker metadata is cleared. Values already filled into a website remain under that website's control. |
| Extension/browser reload | Vault must be unlocked again; no persisted key or plaintext vault restores it. |
| Worker suspension | Fresh field focus opens a new picker; stale tickets fail safely. Offscreen memory session remains subject to lock deadlines. |
| Disable suggestions | Existing controls disappear and future pages receive no suggestions. Shortcut remains available where the browser grants temporary access. |
| Save/update | Review and confirm explicitly. Inspect API request bodies: only encrypted data/nonce/conditional-update fields, never username, password or approved addresses. |

Google, Facebook, Instagram and LinkedIn must each be tested against their current pages; successful generic fixtures do not establish universal production compatibility. If permission is granted but no picker appears, check whether the form uses an iframe, a closed shadow root, non-input editors or ambiguous markup. Form-less widgets and open shadow roots are supported by Phase 14. Those require a targeted compatibility change rather than broader permission or weaker matching.

The [Google detection fix](extension-fix-google-form-detection.md) records a successful live WebLite username-step check with fixture credentials and no login submission. Other Google variants and the live password step still need manual verification.

[Phase 14](extension-phase-14-generic-login-detection.md) records successful live testing of the modern form-less Google username step and generic fixture tests for form-less pairs, accessible labels and open shadow roots. Test these layouts separately from traditional HTML forms.
