import { z } from "zod";
import { vaultEntrySchema } from "@password-manager/shared";
import type { AuthRequest, AuthResult } from "../messaging/auth";
import { matchingOrigin } from "../popup/sites/matching";

const startSchema = z.object({ type: z.literal("capture/start"), tabId: z.number().int().positive(), documentId: z.string().min(1).max(100), origin: z.string().url() }).strict();
const submitSchema = z.object({ type: z.literal("capture/submit"), token: z.string().uuid(), cipherText: z.string().min(24).max(32768).regex(/^[A-Za-z0-9+/]+={0,2}$/),
  nonce: z.string().length(16).regex(/^[A-Za-z0-9+/]{16}$/), wrappedKey: z.string().length(344).regex(/^[A-Za-z0-9+/]+={0,2}$/) }).strict();
type Pending = z.infer<typeof startSchema> & { token: string; accountId: string; expires: number; privateKey: CryptoKey;
  payload?: z.infer<typeof submitSchema> };

// One explicitly armed capture, encrypted in worker memory only. Worker restart
// loses the key and capture. This key is unrelated to the user's vault key.
export function createCaptureBroker(auth: (request: AuthRequest) => Promise<AuthResult>, browser: Pick<typeof chrome, "tabs"> = chrome,
  notify: (available: boolean) => void = () => {}) {
  let pending: Pending | null = null;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const clear = () => { ++generation; pending = null; clearTimeout(timer); notify(false); };
  const active = async (origin: string, tabId?: number) => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    return tabs.length === 1 && tabs[0]?.status !== "loading" && (!tabId || tabs[0]?.id === tabId) && matchingOrigin(tabs[0]?.url) === origin;
  };
  async function handle(message: unknown, sender: chrome.runtime.MessageSender, popup: boolean) {
    const submitted = submitSchema.safeParse(message);
    if (submitted.success && !popup) {
      const watch = pending;
      if (!watch || watch.expires <= Date.now() || watch.payload || submitted.data.token !== watch.token ||
        sender.tab?.id !== watch.tabId || sender.frameId !== 0 || sender.documentId !== watch.documentId || matchingOrigin(sender.url) !== watch.origin)
        return { ok: false };
      watch.payload = submitted.data;
      notify(true);
      return { ok: true };
    }
    if (!popup) return { ok: false };
    if (message && typeof message === "object" && "type" in message && message.type === "capture/cancel" && Object.keys(message).length === 1) { clear(); return { ok: true }; }
    const start = startSchema.safeParse(message);
    const take = Boolean(message && typeof message === "object" && "type" in message && message.type === "capture/take" && Object.keys(message).length === 1);
    if (!start.success && !take) return { ok: false };
    const epoch = generation;
    const result = await auth({ type: "auth/session" });
    if (epoch !== generation) return { ok: false };
    if (!result.ok || result.state !== "signed-in" || !result.profile.emailVerified || Date.parse(result.profile.sessionExpiresAt) <= Date.now()) { clear(); return { ok: false }; }
    if (start.success) {
      const data = start.data;
      if (matchingOrigin(data.origin) !== data.origin || !await active(data.origin, data.tabId) || epoch !== generation) return { ok: false };
      clear(); const version = generation;
      const keys = await crypto.subtle.generateKey({ name: "RSA-OAEP", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, false, ["encrypt", "decrypt"]);
      if (version !== generation) return { ok: false };
      pending = { ...data, token: crypto.randomUUID(), accountId: result.profile.id, privateKey: keys.privateKey,
        expires: Math.min(Date.now() + 120000, Date.parse(result.profile.sessionExpiresAt)) };
      timer = setTimeout(clear, Math.max(0, pending.expires - Date.now()));
      return { ok: true, token: pending.token, publicKey: await crypto.subtle.exportKey("jwk", keys.publicKey), expires: pending.expires };
    }
    const watch = pending;
    if (!watch || watch.accountId !== result.profile.id || watch.expires <= Date.now()) { clear(); return { ok: true, entry: null }; }
    const version = generation;
    if (!watch.payload || !await active(watch.origin, watch.tabId) || pending !== watch || version !== generation) return { ok: true, entry: null };
    try {
      const decode = (value: string) => Uint8Array.from(atob(value), char => char.charCodeAt(0));
      const rawKey = new Uint8Array(await crypto.subtle.decrypt({ name: "RSA-OAEP" }, watch.privateKey, decode(watch.payload.wrappedKey)));
      let key: CryptoKey;
      try { key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]); }
      finally { rawKey.fill(0); }
      const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: "AES-GCM", iv: decode(watch.payload.nonce), additionalData: new TextEncoder().encode(watch.token) }, key, decode(watch.payload.cipherText)));
      let parsed;
      try { parsed = vaultEntrySchema.safeParse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(plaintext))); }
      finally { plaintext.fill(0); }
      if (version !== generation || !parsed.success || parsed.data.website !== watch.origin || parsed.data.password.length > 4096) { clear(); return { ok: false }; }
      clear(); return { ok: true, entry: parsed.data };
    } catch { clear(); return { ok: false }; }
  }
  const reconcile = (result: AuthResult) => {
    if (pending && (!result.ok || result.state !== "signed-in" || !result.profile.emailVerified ||
      result.profile.id !== pending.accountId || Date.parse(result.profile.sessionExpiresAt) <= Date.now())) clear();
  };
  return { handle, clear, reconcile };
}
