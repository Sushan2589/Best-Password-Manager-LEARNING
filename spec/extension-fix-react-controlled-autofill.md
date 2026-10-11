# Fix — React-controlled login fields (Vidya Nepal)

## Report and cause

On `https://www.vidyanepal.tech/admin/login`, selecting a saved account filled only one login field. A public, unauthenticated browser reproduction confirmed that the form has visible id-only username/current-password inputs with standard autocomplete attributes and a same-origin action. Detection supported the form, but the old fill operation reported success while the password reverted to empty.

The implementation set both input values before dispatching either field's input event. React's controlled-input restoration after the first event restored the other field from its still-empty state. The earlier event-listener fixture did not reproduce real React-controlled inputs, so it missed this defect.

## Change

`src/content/forms.ts` now applies the native value setter and input/change events to one field at a time. Each field's controlled state commits before filling the next field. Origin, connectivity, and visibility are rechecked before delivery/events. Success also requires both final values to equal the selected credential. The same function serves popup autofill, Alt+Shift+L/context-menu selection, and field suggestions. No automatic submit, permissions expansion, backend change, or crypto change was introduced.

`tests/fixtures/react-login.ts` is a real React-controlled login form with id-only fields, bundled only by the browser-test fixture through the existing Vite dependency. New tests fill through suggestions from either field and assert both DOM values and both React state values, without submission.

## Field suggestions on the reported site

An isolated Chromium profile loaded a separate test extension bundle and visited the actual public login page. Authentication/vault API responses were mocked with encrypted public fixture credentials, and site access was explicitly enabled. Clicking the username field displayed the picker; selecting the dummy account retained both values. No login form was submitted, no real credentials were used, and no backend account or vault was modified.

There was no additional detection failure in that check. Field suggestions require enabling **Settings → Enable suggestions for this website** on the exact `https://www.vidyanepal.tech` origin. Shortcut filling uses temporary activeTab permission and can therefore work even when passive field suggestions are not enabled. Rebuilding alone does not reload Chrome's installed extension scripts: reload the unpacked extension and refresh already-open website tabs.

## Validation

- Before the fix, the real page retained the dummy username and lost the dummy password despite a success result.
- After the fix, both values persisted on the real page using the shared operation and through the complete extension suggestion flow.
- Both new real React browser regressions passed.
- All 20 interaction browser tests and 40 affected unit tests passed, including the new real React regressions. TypeScript, the development build, and git diff whitespace checks passed.

## User verification

Reload the extension at chrome://extensions or edge://extensions, refresh the login page, unlock the vault, and enable suggestions for the current website in Settings. Click username or password and choose an account; both fields should fill. Repeat with Alt+Shift+L. Neither operation should submit.
