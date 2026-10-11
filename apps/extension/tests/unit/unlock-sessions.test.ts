import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionOwner } from "../../src/session/owner";
import { VaultSession } from "../../src/popup/vault/session";
import { RemoteVault } from "../../src/popup/vault/remote";
import { sessionRequestSchema, trustedVaultUi } from "../../src/messaging/session";
import { websitePermission } from "../../src/background/inlinePermissions";
import type { AuthResult } from "../../src/messaging/auth";
import fixture from "../fixtures/legacy-vault.json";

afterEach(() => vi.useRealTimers());
function setup(expiry = 3600000) {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-11T00:00:00Z"));
  const profile = { id: "00000000-0000-4000-8000-000000000001", email: "fixture@example.com", name: "Fixture", emailVerified: true,
    sessionExpiresAt: new Date(Date.now() + expiry).toISOString() };
  const auth = vi.fn<() => Promise<AuthResult>>().mockResolvedValue({ ok: true, state: "signed-in", profile });
  const decrypt = vi.fn().mockResolvedValue(JSON.stringify(fixture.entry));
  const vault = new VaultSession({ validateSession: auth, derive: vi.fn().mockResolvedValue({} as CryptoKey), decrypt,
    snapshot: vi.fn().mockResolvedValue({ ok: true, snapshot: { profile, vaultSalt: fixture.salt, items: [{ id: "00000000-0000-4000-8000-000000000002", userId: profile.id,
      cipherText: fixture.cipherText, nonce: fixture.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" }] } }) });
  const owner = new SessionOwner(vault, auth);
  return { owner, vault, auth, profile, decrypt };
}

describe("memory-only unlocked session", () => {
  it("retains the key across independent popup clients but drops their local copies", async () => {
    const { owner, vault } = setup();
    const popup = new RemoteVault(request => owner.handle(request));
    await popup.refresh(); await popup.unlock(fixture.password);
    expect(popup.listCredentials()).toHaveLength(1);
    popup.clear(); expect(popup.listCredentials()).toEqual([]); expect(vault.hasKey()).toBe(true);
    const reopened = new RemoteVault(request => owner.handle(request));
    await reopened.refresh(); expect(reopened.listCredentials()).toHaveLength(1);
    owner.lock(); await reopened.poll(); expect(reopened.listCredentials()).toEqual([]); expect(vault.hasKey()).toBe(false);
  });
  it("polling cannot extend the five-minute inactivity deadline", async () => {
    const { owner, vault } = setup(); await owner.handle({ type: "session/unlock", password: fixture.password });
    const deadline = owner.deadline();
    for (let index = 0; index < 5; index++) { await vi.advanceTimersByTimeAsync(60000); await owner.handle({ type: "session/status" }); }
    expect(deadline).toBe(Date.now()); expect(vault.hasKey()).toBe(false); expect(owner.view().items).toEqual([]);
  });
  it("only explicit activity extends inactivity, never the one-hour maximum", async () => {
    const { owner, vault } = setup(7200000); await owner.handle({ type: "session/unlock", password: fixture.password });
    await owner.handle({ type: "session/policy", policy: 15 });
    for (let index = 0; index < 5; index++) { await vi.advanceTimersByTimeAsync(10 * 60000); await owner.handle({ type: "session/touch" }); }
    expect(vault.hasKey()).toBe(true);
    await vi.advanceTimersByTimeAsync(10 * 60000); expect(vault.hasKey()).toBe(false);
  });
  it("session expiration caps the deadline", async () => {
    const { owner, vault } = setup(45000); await owner.handle({ type: "session/unlock", password: fixture.password });
    await vi.advanceTimersByTimeAsync(45000); expect(vault.hasKey()).toBe(false);
  });
  it("shortened server expiry reschedules destruction without another UI operation", async () => {
    const { owner, vault, auth, profile } = setup();
    await owner.handle({ type: "session/unlock", password: fixture.password });
    auth.mockResolvedValue({ ok: true, state: "signed-in", profile: { ...profile, sessionExpiresAt: new Date(Date.now() + 45000).toISOString() } });
    await owner.reconcile(); await vi.advanceTimersByTimeAsync(45000);
    expect(vault.hasKey()).toBe(false);
  });
  it.each(["signed-out", "unavailable", "account-change", "unverified"])("locks on %s", async condition => {
    const { owner, vault, auth, profile } = setup(); await owner.handle({ type: "session/unlock", password: fixture.password });
    auth.mockResolvedValue(condition === "signed-out" ? { ok: true, state: "signed-out" } : condition === "unavailable" ? { ok: false, error: "unavailable" } :
      { ok: true, state: "signed-in", profile: { ...profile, ...(condition === "unverified" ? { emailVerified: false } : { id: "00000000-0000-4000-8000-000000000009" }) } });
    await owner.reconcile(); expect(vault.hasKey()).toBe(false); expect(owner.view().items).toEqual([]);
  });
  it("manual lock invalidates a slow decryption and cannot be undone by its completion", async () => {
    const { owner, vault, decrypt } = setup();
    let finish!: (value: string) => void;
    decrypt.mockImplementation(() => new Promise<string>(resolve => { finish = resolve; }));
    const unlocking = owner.handle({ type: "session/unlock", password: fixture.password });
    await vi.waitFor(() => expect(decrypt).toHaveBeenCalled());
    owner.lock(); finish(JSON.stringify(fixture.entry)); await unlocking;
    expect(vault.hasKey()).toBe(false); expect(owner.view().state.status).toBe("locked");
  });
  it("a new owner starts locked; no key is recoverable after its destruction", async () => {
    const { owner } = setup(); await owner.handle({ type: "session/unlock", password: fixture.password });
    const replacement = setup(); await replacement.owner.handle({ type: "session/view" });
    expect(replacement.vault.hasKey()).toBe(false); expect(replacement.owner.view().items).toEqual([]);
  });
  it("late popup replies cannot restore cleared plaintext", async () => {
    const { owner } = setup(); await owner.handle({ type: "session/unlock", password: fixture.password });
    let reply!: (value: Awaited<ReturnType<typeof owner.handle>>) => void;
    const remote = new RemoteVault(() => new Promise(resolve => { reply = resolve; }));
    const reading = remote.refresh(); remote.clear(); reply(await owner.handle({ type: "session/view" })); await reading;
    expect(remote.listCredentials()).toEqual([]);
  });
  it("an expired server session before unlock produces an actionable authentication error", async () => {
    const { owner, auth, vault } = setup();
    auth.mockResolvedValue({ ok: true, state: "signed-out" });
    const reply = await owner.handle({ type: "session/unlock", password: fixture.password });
    expect(reply.ok && reply.view.state.error).toBe("unauthenticated"); expect(vault.hasKey()).toBe(false);
  });
});

describe("trusted session and permission boundaries", () => {
  const id = "trusted";
  it("accepts only packaged popup and exact chooser URLs", () => {
    expect(trustedVaultUi({ id, url: `chrome-extension://${id}/popup.html` }, id)).toBe(true);
    expect(trustedVaultUi({ id, url: `chrome-extension://${id}/fill.html?request=00000000-0000-4000-8000-000000000001` }, id)).toBe(true);
  });
  it.each(["https://evil.example", "chrome-extension://trusted/offscreen.html", "chrome-extension://trusted/popup.html?spoof=1", "chrome-extension://trusted/fill.html", "chrome-extension://other/popup.html"])("rejects %s", url => {
    expect(trustedVaultUi({ id, url, tab: { id: 1 } as chrome.tabs.Tab }, id)).toBe(false);
  });
  it("requires an exact HTTPS permission pattern", () => {
    expect(websitePermission("https://www.vidyanepal.tech")).toBe("https://www.vidyanepal.tech/*");
    expect(() => websitePermission("http://www.vidyanepal.tech")).toThrow();
    expect(() => websitePermission("https://example.com/path")).toThrow();
    expect(() => websitePermission("https://example.com@evil.com")).toThrow();
  });
  it.each([{ type: "session/unlock", password: "password", url: "https://evil.example" }, { type: "session/policy", policy: 999 },
    { type: "session/unlock", password: "x".repeat(1025) }, { type: "session/entry", id: "not-an-id" }])("rejects malformed commands", request => {
    expect(sessionRequestSchema.safeParse(request).success).toBe(false);
  });
});
