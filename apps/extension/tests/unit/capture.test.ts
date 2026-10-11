import { describe, expect, it, vi } from "vitest";
import { createCaptureBroker } from "../../src/background/capture";
const profile = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com", emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };
const start = { type: "capture/start", tabId: 1, documentId: "document", origin: "https://example.com" };
const sender = { tab: { id: 1 }, frameId: 0, documentId: "document", url: "https://example.com/login" } as chrome.runtime.MessageSender;
const entry = { title: "Example", username: "public-user", password: "public-password", website: start.origin };
function setup() {
  const query = vi.fn().mockResolvedValue([{ id: 1, url: start.origin, status: "complete" }]);
  const auth = vi.fn().mockResolvedValue({ ok: true, state: "signed-in", profile });
  return { broker: createCaptureBroker(auth, { tabs: { query } } as never), query, auth };
}
async function payload(watch: { token: string; publicKey: JsonWebKey }) {
  const encode = (bytes: ArrayBuffer | Uint8Array) => Buffer.from(bytes as Uint8Array).toString("base64");
  const raw = crypto.getRandomValues(new Uint8Array(32)); const nonce = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const publicKey = await crypto.subtle.importKey("jwk", watch.publicKey, { name: "RSA-OAEP", hash: "SHA-256" }, false, ["encrypt"]);
  return { type: "capture/submit", token: watch.token, nonce: encode(nonce), wrappedKey: encode(await crypto.subtle.encrypt("RSA-OAEP", publicKey, raw)),
    cipherText: encode(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, additionalData: new TextEncoder().encode(watch.token) }, key, new TextEncoder().encode(JSON.stringify(entry)))) };
}
async function arm(broker: ReturnType<typeof createCaptureBroker>) {
  const response = await broker.handle(start, {}, true);
  if (!("token" in response) || !response.token || !("publicKey" in response) || !response.publicKey) throw new Error("Failed test arm");
  return { token: response.token, publicKey: response.publicKey };
}
describe("bounded encrypted submission captures", () => {
  it("decrypts only for the authenticated popup and consumes the pending capture", async () => {
    const { broker } = setup(); const watch = await arm(broker); const encrypted = await payload(watch);
    expect(JSON.stringify(encrypted)).not.toContain(entry.password);
    expect(await broker.handle(encrypted, sender, false)).toEqual({ ok: true });
    expect(await broker.handle({ type: "capture/take" }, sender, false)).toEqual({ ok: false });
    expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry });
    expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry: null }); broker.clear();
  });
  it.each([{ frameId: 1 }, { documentId: "other" }, { tab: { id: 2 } }, { url: "https://example.com.evil.com" }])("rejects forged frame/tab/document/origin: %s", async patch => {
    const { broker } = setup(); const watch = await arm(broker);
    expect(await broker.handle(await payload(watch), { ...sender, ...patch } as chrome.runtime.MessageSender, false)).toEqual({ ok: false }); broker.clear();
  });
  it("discards captures on cancel, account switching, or worker restart", async () => {
    const { broker, auth } = setup(); let watch = await arm(broker);
    await broker.handle(await payload(watch), sender, false); broker.clear();
    expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry: null });
    watch = await arm(broker); await broker.handle(await payload(watch), sender, false);
    auth.mockResolvedValue({ ok: true, state: "signed-in", profile: { ...profile, id: "other" } });
    expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry: null });
    const restarted = setup().broker;
    expect(await restarted.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry: null }); restarted.clear(); broker.clear();
  });
  it("denies reading from another tab and rejects ciphertext tampering", async () => {
    const { broker, query } = setup(); const watch = await arm(broker); const encrypted = await payload(watch);
    await broker.handle({ ...encrypted, nonce: "AAAAAAAAAAAAAAAA" }, sender, false);
    query.mockResolvedValue([{ id: 2, url: start.origin }]);
    expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry: null });
    query.mockResolvedValue([{ id: 1, url: start.origin }]);
    expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: false }); broker.clear();
  });
  it("does not resurrect a watch after cancellation during session validation", async () => {
    const { broker, auth } = setup(); let release!: (value: unknown) => void;
    auth.mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = broker.handle(start, {}, true); broker.clear(); release({ ok: true, state: "signed-in", profile });
    expect(await pending).toEqual({ ok: false }); broker.clear();
  });
  it("rejects expired captures without waiting for the cleanup timer", async () => {
    const { broker } = setup(); const watch = await arm(broker); const encrypted = await payload(watch);
    const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 121000);
    try {
      expect(await broker.handle(encrypted, sender, false)).toEqual({ ok: false });
      expect(await broker.handle({ type: "capture/take" }, {}, true)).toEqual({ ok: true, entry: null });
    } finally { clock.mockRestore(); broker.clear(); }
  });
  it("clears an armed capture when popup session polling discovers logout", async () => {
    const { broker } = setup(); const watch = await arm(broker);
    broker.reconcile({ ok: true, state: "signed-out" });
    expect(await broker.handle(await payload(watch), sender, false)).toEqual({ ok: false }); broker.clear();
  });
});
