export type WatchOptions = { origin: string; token: string; publicKey: JsonWebKey; expires: number };

// Runs only in the extension's isolated top-frame world, after explicit arming.
export function watchSubmissions(options: WatchOptions) {
  if (window.top !== window || location.protocol !== "https:" || location.origin !== options.origin || options.expires <= Date.now()) return false;
  const scope = globalThis as typeof globalThis & { passwordManagerWatchStop?: () => void };
  scope.passwordManagerWatchStop?.();
  let stopped = false;
  let busy = false;
  const stop = () => { stopped = true; document.removeEventListener("submit", capture, true); clearTimeout(timer); delete scope.passwordManagerWatchStop; };
  const timer = setTimeout(stop, Math.min(120000, options.expires - Date.now()));
  scope.passwordManagerWatchStop = stop;
  const encode = (bytes: Uint8Array) => { let text = ""; for (const byte of bytes) text += String.fromCharCode(byte); return btoa(text); };
  async function capture(event: Event) {
    if (busy || stopped || !event.isTrusted || options.expires <= Date.now() || location.origin !== options.origin || !(event.target instanceof HTMLFormElement)) return;
    const form = event.target;
    try {
      if (new URL(form.action || location.href).origin !== options.origin) return;
      const submitter = (event as SubmitEvent).submitter;
      if ((submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) && submitter.hasAttribute("formaction") && new URL(submitter.formAction).origin !== options.origin) return;
      const inputs = Array.from(form.elements).filter((element): element is HTMLInputElement => element instanceof HTMLInputElement && !element.disabled &&
        element.type !== "hidden" && element.getClientRects().length > 0 && getComputedStyle(element).visibility === "visible");
      const passwords = inputs.filter(input => input.type === "password");
      const newPasswords = passwords.filter(input => /\bnew-password\b/.test(input.autocomplete));
      const selected = newPasswords.length ? newPasswords : passwords;
      if (!selected.length || selected.length > 2 || selected.some(input => input.value !== selected[0]!.value) || !selected[0]!.value || selected[0]!.value.length > 4096) return;
      if (!newPasswords.length && passwords.length !== 1) return;
      const accounts = inputs.filter(input => ["text", "email"].includes(input.type) &&
        (input.type === "email" || /^(username|email)$/.test(input.autocomplete) || /user|login|email|account/i.test(`${input.name} ${input.id}`)));
      if (accounts.length !== 1 || !accounts[0]!.value || accounts[0]!.value.length > 255) return;
      busy = true;
      const entry = { title: location.hostname.slice(0, 100), username: accounts[0]!.value, password: selected[0]!.value, website: options.origin };
      const bytes = new TextEncoder().encode(JSON.stringify(entry)); entry.password = ""; entry.username = "";
      const raw = crypto.getRandomValues(new Uint8Array(32)); const nonce = crypto.getRandomValues(new Uint8Array(12));
      try {
        const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
        const publicKey = await crypto.subtle.importKey("jwk", options.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
        const cipherText = await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(options.token) }, key, bytes);
        const wrappedKey = await crypto.subtle.encrypt({ name: "RSA-OAEP" }, publicKey, raw);
        if (stopped || location.origin !== options.origin || options.expires <= Date.now()) return;
        await chrome.runtime.sendMessage({ type: "capture/submit", token: options.token, cipherText: encode(new Uint8Array(cipherText)), nonce: encode(nonce), wrappedKey: encode(new Uint8Array(wrappedKey)) });
        stop();
      } finally { raw.fill(0); bytes.fill(0); }
    } catch { busy = false; }
  }
  document.addEventListener("submit", capture, true);
  return true;
}

export function cancelSubmissionWatch() {
  (globalThis as typeof globalThis & { passwordManagerWatchStop?: () => void }).passwordManagerWatchStop?.();
}
