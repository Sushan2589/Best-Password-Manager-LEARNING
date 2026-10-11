export type FormChoice = { index: number; signature: string; label: string };
export type FormOperation = { mode: "probe"; origin: string; focusedOnly?: boolean } |
  { mode: "fill"; origin: string; index: number; signature: string; username: string; password: string };
export type FormResult = { ok: true; forms: FormChoice[] } | { ok: true; filled: true } | { ok: false };

// Self-contained: Chrome serializes this packaged function into its ISOLATED world.
// No imports, page-world globals, attributes, messaging, or vault access.
export function formOperation(request: FormOperation): FormResult {
  if (window.top !== window || location.protocol !== "https:" || location.origin !== request.origin) return { ok: false };
  const visible = (input: HTMLInputElement) => {
    const style = getComputedStyle(input);
    return !input.disabled && !input.readOnly && input.type !== "hidden" && input.getClientRects().length > 0 &&
      style.visibility === "visible" && style.display !== "none" && Number(style.opacity) !== 0;
  };
  // Named form controls can override properties such as form.action. Read the
  // attribute through the native DOM method, then resolve relative URLs.
  const actionUrl = (form: HTMLFormElement) => new URL(Element.prototype.getAttribute.call(form, "action") || location.href, location.href);
  const safeAction = (form: HTMLFormElement) => {
    try {
      if (actionUrl(form).origin !== request.origin) return false;
      return !Array.from(form.elements).some(button => (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) && button.hasAttribute("formaction") && new URL(button.formAction).origin !== request.origin);
    } catch { return false; }
  };
  // Scan normal DOM and open shadow roots in a stable order. Closed roots and
  // child frames are deliberately outside this top-document operation.
  const allInputs: HTMLInputElement[] = [];
  const roots: Array<Document | ShadowRoot> = [document];
  for (let i = 0; i < roots.length && i < 100; i++) {
    for (const element of roots[i]!.querySelectorAll("*")) {
      if (element instanceof HTMLInputElement) allInputs.push(element);
      if (element.shadowRoot) roots.push(element.shadowRoot);
    }
  }
  const accountStrength = (input: HTMLInputElement) => {
    if (!["text", "email", "tel"].includes(input.type) || /\b(one-time-code|new-password)\b/.test(input.autocomplete)) return 0;
    const root = input.getRootNode() as Document | ShadowRoot;
    const labelled = (input.getAttribute("aria-labelledby") || "").split(/\s+/).map(id => root.getElementById?.(id)?.textContent || "").join(" ");
    const descriptive = `${input.getAttribute("aria-label") || ""} ${input.placeholder} ${Array.from(input.labels ?? []).map(label => label.textContent).join(" ")} ${labelled}`;
    const identity = `${input.name} ${input.id}`;
    if (/otp|one.?time|verification|security.?code|search/i.test(`${identity} ${descriptive}`)) return 0;
    if (input.type === "email" || /\b(username|email)\b/.test(input.autocomplete) || /user.?name|e.?mail|email or phone|login.?id|phone number|mobile number/i.test(descriptive)) return 2;
    return /user|login|email|account|identifier/i.test(identity) ? 1 : 0;
  };
  const usable = allInputs.filter(visible);
  const containers: Array<{ element: Element; inputs: HTMLInputElement[]; form: HTMLFormElement | null }> = [];
  const forms = [...new Set(allInputs.map(input => input.form).filter((form): form is HTMLFormElement => !!form))];
  for (const form of forms) containers.push({ element: form, inputs: allInputs.filter(input => input.form === form), form });
  for (const input of usable.filter(input => !input.form && (input.type === "password" || accountStrength(input) > 0))) {
    let container: Element = input.parentElement ?? input;
    // Prefer a local group with both account and password, without crossing a
    // competing login widget, a form, or a shadow-root boundary.
    for (let parent = input.parentElement; parent && parent !== document.body && parent !== document.documentElement; parent = parent.parentElement) {
      const local = usable.filter(field => !field.form && parent.contains(field));
      const passwords = local.filter(field => field.type === "password");
      const accounts = local.filter(field => accountStrength(field) > 0);
      if (passwords.length > 1 || accounts.length > 1) { container = parent; break; }
      if (passwords.length === 1 && accounts.length === 1 || parent.getAttribute("role") === "form") { container = parent; break; }
    }
    if (!containers.some(group => group.element === container)) containers.push({ element: container, inputs: allInputs.filter(field => !field.form && container.contains(field)), form: null });
  }
  const candidates = containers.flatMap(({ element, inputs: grouped, form }, index) => {
    if (form && !safeAction(form)) return [];
    if (/\/(signup|register|create-account)(\/|$)/i.test(location.pathname) || grouped.some(input => /\bnew-password\b/.test(input.autocomplete))) return [];
    const inputs = grouped.filter(visible);
    const passwords = inputs.filter(input => input.type === "password");
    if (passwords.length > 1) return [];
    const accounts = inputs.filter(input => accountStrength(input) > 0);
    if (accounts.length > 1 || !passwords.length && accounts.length !== 1) return [];
    const username = accounts[0] ?? null; const password = passwords[0] ?? null;
    if (!password && username && accountStrength(username) < 2) return [];
    if (!username && password && !/\bcurrent-password\b/.test(password.autocomplete)) return [];
    // Locator indices and semantic attributes bind the freshly detected group;
    // no values, generated DOM attributes or page messages are used.
    const signature = JSON.stringify([index, allInputs.indexOf(username!), allInputs.indexOf(password!), username?.name ?? "", username?.id ?? "", username?.type ?? "", username?.autocomplete ?? "", password?.name ?? "", password?.id ?? "", password?.autocomplete ?? "", form ? actionUrl(form).href : location.href]);
    return [{ element, username, password, index, signature }];
  });
  const focusedInput = () => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  };
  if (request.mode === "probe") {
    const focused = candidates.find(candidate => candidate.username === focusedInput() || candidate.password === focusedInput());
    const ordered = request.focusedOnly ? focused ? [focused] : [] : focused ? [focused, ...candidates.filter(candidate => candidate !== focused)] : candidates;
    return { ok: true, forms: ordered.slice(0, 20).map(({ index, signature, username, password }) => ({ index, signature, label: `${username && password ? "Login form" : username ? "Username step" : "Password step"} ${index + 1}` })) };
  }
  const selected = candidates.find(form => form.index === request.index && form.signature === request.signature);
  if (!selected || location.origin !== request.origin || request.username.length > 255 || request.password.length > 4096) return { ok: false };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) return { ok: false };
  // Commit each controlled input before setting the next. React restores other
  // controlled fields after an input event, so setting both up front loses one.
  const fields = [[selected.username, request.username], [selected.password, request.password]] as const;
  for (const [input, value] of fields) {
    if (!input) continue;
    if (location.origin !== request.origin || !input.isConnected || !visible(input)) return { ok: false };
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    if (location.origin !== request.origin || !input.isConnected || !visible(input)) return { ok: false };
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  // Do not report success if a framework rejected/restored either value.
  return fields.every(([input, value]) => !input || input.isConnected && visible(input) && input.value === value) ? { ok: true, filled: true } : { ok: false };
}
