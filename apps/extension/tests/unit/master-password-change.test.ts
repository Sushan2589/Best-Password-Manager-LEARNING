import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createVaultVerifier, decrypt, encrypt, verifyVaultKey } from "@password-manager/crypto";
import { vaultRotationSchema } from "@password-manager/shared";
import { changeMasterPassword, prepareVaultPasswordChange } from "../../../web/src/lib/crypto/changeMasterPassword";
import { clearVaultKey, getVaultKey, setVaultKey } from "../../../web/src/lib/crypto/vaultKeyStore";
import { createVaultWriter } from "../../src/api/write";

const mock = vi.hoisted(() => ({ derive: vi.fn() }));
vi.mock("@password-manager/crypto", async original => ({ ...await original<typeof import("@password-manager/crypto")>(), deriveCryptoKey: mock.derive }));
const accountId = "00000000-0000-4000-8000-000000000001";
const salt = btoa("0123456789abcdef"); const current = "public old master password"; const next = "public new master password";
const plaintext = JSON.stringify({ title: "Fixture", username: "fixture", password: "public saved fixture", notes: "Keep this", website: "https://example.com", approvedOrigins: ["https://accounts.example.com"], futureMetadata: { keep: true } });
let oldKey: CryptoKey; let newKey: CryptoKey; let wrongKey: CryptoKey;
let snapshot: { accountId: string; vaultSalt: string; revision: number; keyVersion: number; verifier: { cipherText: string; nonce: string }; items: { id: string; userId: string; createdAt: string; updatedAt: string; cipherText: string; nonce: string }[] };
beforeAll(async () => {
  const generate = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  [oldKey, newKey, wrongKey] = await Promise.all([generate(), generate(), generate()]);
  const item = { userId: accountId, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", ...await encrypt(plaintext, oldKey) };
  snapshot = { accountId, vaultSalt: salt, revision: 7, keyVersion: 0, verifier: await createVaultVerifier(oldKey, accountId), items: [
    { ...item, id: "00000000-0000-4000-8000-000000000002" }, { ...item, id: "00000000-0000-4000-8000-000000000003" },
  ] };
});
beforeEach(() => { mock.derive.mockImplementation(async (password: string) => password === current ? oldKey : password === next ? newKey : wrongKey); });
afterEach(() => { clearVaultKey(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const input = () => ({ accountPassword: "public account fixture password", currentMaster: current, newMaster: next, confirmation: next, code: "123456" });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
describe("local master-password preparation", () => {
  it("uses fresh salts/nonces and preserves all original JSON including approved origins and future metadata", async () => {
    const before = structuredClone(snapshot);
    const changed = await prepareVaultPasswordChange(snapshot, current, next, next);
    expect(changed.expectedRevision).toBe(7); expect(changed.expectedSalt).toBe(salt); expect(changed.newSalt).not.toBe(salt);
    expect(changed.items.map(item => item.id)).toEqual(snapshot.items.map(item => item.id));
    expect(new Set(changed.items.map(item => item.nonce)).size).toBe(2);
    await verifyVaultKey(newKey, accountId, changed.verifier);
    for (const item of changed.items) {
      expect(await decrypt(item.cipherText, item.nonce, newKey)).toBe(plaintext);
      await expect(decrypt(item.cipherText, item.nonce, oldKey)).rejects.toThrow();
    }
    expect(snapshot).toEqual(before); expect(oldKey.extractable).toBe(false); expect(newKey.extractable).toBe(false);
  });
  it.each([["wrong password", next, next], [current, "short", "short"], [current, next, "different"], [current, current, current]])("rejects wrong/weak/reused/mismatched passwords", async (old, password, confirm) => {
    await expect(prepareVaultPasswordChange(snapshot, old, password, confirm)).rejects.toThrow();
  });
  it("rejects a damaged last entry before deriving the replacement key", async () => {
    const damaged = structuredClone(snapshot); damaged.items[1]!.cipherText = (await encrypt(plaintext, wrongKey)).cipherText;
    await expect(prepareVaultPasswordChange(damaged, current, next, next)).rejects.toThrow("Nothing was changed");
    expect(mock.derive).toHaveBeenCalledTimes(1);
  });
  it("supports verified empty vaults and legacy populated vaults but cannot prove an uninitialized empty password", async () => {
    await expect(prepareVaultPasswordChange({ ...snapshot, items: [], verifier: null }, current, next, next)).rejects.toThrow("set up this empty vault first");
    expect((await prepareVaultPasswordChange({ ...snapshot, items: [] }, current, next, next)).items).toEqual([]);
    expect((await prepareVaultPasswordChange({ ...snapshot, verifier: null }, current, next, next)).items).toHaveLength(2);
  });
  it("rejects foreign owners, repeated IDs, identical salts and malformed envelopes", async () => {
    await expect(prepareVaultPasswordChange({ ...snapshot, accountId: "00000000-0000-4000-8000-000000000009" }, current, next, next)).rejects.toThrow();
    await expect(prepareVaultPasswordChange({ ...snapshot, items: [snapshot.items[0], snapshot.items[0]] }, current, next, next)).rejects.toThrow();
    const change = await prepareVaultPasswordChange(snapshot, current, next, next);
    expect(vaultRotationSchema.safeParse({ ...change, newSalt: change.expectedSalt }).success).toBe(false);
    expect(vaultRotationSchema.safeParse({ ...change, items: [change.items[0], change.items[0]] }).success).toBe(false);
    expect(vaultRotationSchema.safeParse({ ...change, verifier: { cipherText: "plaintext", nonce: "wrong" } }).success).toBe(false);
  });
});
describe("master-password request and lock lifecycle", () => {
  it("sends only account reauthentication and ciphertext, clears input references and keeps the vault locked", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(snapshot)).mockResolvedValueOnce(json({ message: "Changed" })); vi.stubGlobal("fetch", fetcher);
    setVaultKey(oldKey, accountId, undefined, salt); const secrets = input(); const saving = vi.fn();
    await changeMasterPassword(secrets, new AbortController().signal, saving);
    const [url, options] = fetcher.mock.calls[1]!; const body = JSON.parse(options.body);
    expect(String(url)).toMatch(/\/vault\/change-password$/); expect(options.headers["X-Vault-Account"]).toBe(accountId);
    expect(Object.keys(body).sort()).toEqual(["accountPassword", "code", "rotation"]);
    expect(options.body).not.toContain(current); expect(options.body).not.toContain(next); expect(options.body).not.toContain("public saved fixture");
    expect(vaultRotationSchema.safeParse(body.rotation).success).toBe(true); expect(saving).toHaveBeenCalledOnce(); expect(getVaultKey()).toBeNull();
    expect([secrets.accountPassword, secrets.currentMaster, secrets.newMaster, secrets.confirmation].every(value => value === "")).toBe(true);
  });
  it("cannot submit after cancellation or a manual lock during derivation", async () => {
    for (const reason of ["abort", "lock"]) {
      const fetcher = vi.fn().mockResolvedValue(json(snapshot)); vi.stubGlobal("fetch", fetcher);
      const controller = new AbortController();
      mock.derive.mockImplementationOnce(async () => { if (reason === "abort") controller.abort(); else clearVaultKey(); return oldKey; });
      await expect(changeMasterPassword(input(), controller.signal, vi.fn())).rejects.toThrow("cancelled");
      expect(fetcher).toHaveBeenCalledOnce(); expect(getVaultKey()).toBeNull();
    }
  });
  it("never sends a change if the current password is incorrect or an entry cannot decrypt", async () => {
    const fetcher = vi.fn().mockResolvedValue(json(snapshot)); vi.stubGlobal("fetch", fetcher);
    await expect(changeMasterPassword({ ...input(), currentMaster: "wrong public password" }, new AbortController().signal, vi.fn())).rejects.toThrow("Nothing was changed");
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it.each([401, 403, 409, 429, 503])("handles rejected status %s without retrying a commit", async status => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(snapshot)).mockResolvedValueOnce(json({ error: "fixture" }, status)); vi.stubGlobal("fetch", fetcher);
    await expect(changeMasterPassword(input(), new AbortController().signal, vi.fn())).rejects.toThrow("Nothing was changed");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(getVaultKey()).toBeNull();
  });
  it("reports an ambiguous save safely rather than claiming rollback or automatically retrying", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json(snapshot)).mockRejectedValueOnce(new TypeError("public network fixture")); vi.stubGlobal("fetch", fetcher);
    await expect(changeMasterPassword(input(), new AbortController().signal, vi.fn())).rejects.toThrow("new master password");
    expect(fetcher).toHaveBeenCalledTimes(2); expect(getVaultKey()).toBeNull();
  });
  it("binds extension writes to the salt used for encryption and refuses a changed salt before sending ciphertext", async () => {
    const profile = { id: accountId, name: "Fixture", email: "fixture@example.com", emailVerified: true, sessionExpiresAt: new Date(Date.now()+3600000).toISOString() };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...profile, vaultSalt: btoa("fedcba9876543210") }));
    const request = { type: "vault/write" as const, accountId, vaultSalt: salt, cipherText: snapshot.items[0]!.cipherText, nonce: snapshot.items[0]!.nonce };
    expect(await createVaultWriter("https://api.example.com", fetcher)(request)).toEqual({ ok: false, error: "conflict" });
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockReset().mockResolvedValueOnce(json({ ...profile, vaultSalt: salt })).mockResolvedValueOnce(json(snapshot.items[0]));
    expect((await createVaultWriter("https://api.example.com", fetcher)(request)).ok).toBe(true);
    expect((fetcher.mock.calls[1]![1]!.headers as Record<string, string>)["X-Vault-Salt"]).toBe(salt);
  });
});
