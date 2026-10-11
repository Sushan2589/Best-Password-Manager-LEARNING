export type FormChoice = { index: number; signature: string; label: string };
export type FormOperation = { mode: "probe"; origin: string } |
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
  const safeAction = (form: HTMLFormElement) => {
    try {
      if (new URL(form.action || location.href).origin !== request.origin) return false;
      return !Array.from(form.elements).some(button => (button instanceof HTMLButtonElement || button instanceof HTMLInputElement) && button.hasAttribute("formaction") && new URL(button.formAction).origin !== request.origin);
    } catch { return false; }
  };
  const candidates = Array.from(document.forms).flatMap((form, index) => {
    if (!safeAction(form)) return [];
    const inputs = Array.from(form.elements).filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && visible(element));
    const passwords = inputs.filter(input => input.type === "password");
    if (passwords.length !== 1 || /\bnew-password\b/.test(passwords[0]!.autocomplete)) return [];
    const accounts = inputs.filter(input => ["text", "email", "tel"].includes(input.type) &&
      (input.type === "email" || /^(username|email)$/.test(input.autocomplete) || /user|login|email|account/i.test(`${input.name} ${input.id}`)));
    if (accounts.length !== 1) return [];
    const username = accounts[0]!; const password = passwords[0]!;
    const signature = JSON.stringify([index, username.name, username.id, username.type, password.name, password.id, password.autocomplete, form.action]);
    return [{ form, username, password, index, signature }];
  });
  if (request.mode === "probe") return { ok: true, forms: candidates.slice(0, 20).map(({ index, signature }) => ({ index, signature, label: `Login form ${index + 1}` })) };
  const selected = candidates.find(form => form.index === request.index && form.signature === request.signature);
  if (!selected || location.origin !== request.origin || request.username.length > 255 || request.password.length > 4096) return { ok: false };
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  if (!setter) return { ok: false };
  // Set both values before events, then recheck before each event dispatch.
  setter.call(selected.username, request.username); setter.call(selected.password, request.password);
  for (const input of [selected.username, selected.password]) {
    if (location.origin !== request.origin || !input.isConnected || !visible(input)) return { ok: false };
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }
  return { ok: true, filled: true };
}
