import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { unlockVault } from "../../../web/src/lib/crypto/unlockVault";
import { authorizeVaultKey } from "../../../web/src/lib/crypto/vaultSession";
import { clearVaultKey, getVaultKey } from "../../../web/src/lib/crypto/vaultKeyStore";
import fixture from "../fixtures/legacy-vault.json";
const mock = vi.hoisted(() => ({ derive: vi.fn() }));
vi.mock("@password-manager/crypto", async importOriginal => ({ ...await importOriginal<typeof import("@password-manager/crypto")>(), deriveCryptoKey: mock.derive }));
let correct: CryptoKey; let wrong: CryptoKey;
const profile = { id: "00000000-0000-4000-8000-000000000001", emailVerified: true, vaultSalt: fixture.salt, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };
const item = { id: "00000000-0000-4000-8000-000000000002", userId: profile.id, cipherText: fixture.cipherText, nonce: fixture.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
beforeAll(async () => {
  correct = await crypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt", "decrypt"]);
  wrong = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
});
beforeEach(() => { mock.derive.mockImplementation(async password => password === fixture.password ? correct : wrong); });
afterEach(() => { clearVaultKey(); vi.unstubAllGlobals(); });
function api(items: unknown[] = [item]) {
  const request = vi.fn().mockImplementation(async (url, options) => new Response(JSON.stringify(String(url).endsWith("/vault/setup") ? {} : String(url).endsWith("/vault") ? items : profile), { status: options?.method === "POST" ? 201 : 200 }));
  vi.stubGlobal("fetch", request); return request;
}
it("rejects a wrong password before publishing a key", async () => {
  api(); await expect(unlockVault("wrong-public-password")).rejects.toThrow(); expect(getVaultKey()).toBeNull();
});
it("unlocks existing ciphertext without changing encryption compatibility", async () => {
  api(); expect(await unlockVault(fixture.password)).toBe(true); expect(getVaultKey()).toBe(correct);
});
it("refuses an old web key after the same account signs in with a rotated salt", async () => {
  api(); await unlockVault(fixture.password);
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ ...profile, vaultSalt: btoa("fedcba9876543210") }))));
  await expect(authorizeVaultKey()).rejects.toThrow("Vault locked"); expect(getVaultKey()).toBeNull();
});
it("does not accept an empty vault without explicit confirmed setup", async () => {
  const request = api([]); await expect(unlockVault(fixture.password)).rejects.toThrow("EMPTY_VAULT_SETUP"); expect(getVaultKey()).toBeNull();
  expect(request.mock.calls.some(call => String(call[0]).endsWith("/vault/setup"))).toBe(false);
});
it("sends an encrypted verifier for confirmed setup, never the password", async () => {
  const request = api([]); await unlockVault(fixture.password, fixture.password);
  const sent = request.mock.calls.find(call => String(call[0]).endsWith("/vault/setup"));
  expect(sent).toBeDefined(); expect(sent![1].body).not.toContain(fixture.password); expect(getVaultKey()).toBe(correct);
});
it("cannot finish a delayed unlock after manual lock", async () => {
  api(); let release!: (key: CryptoKey) => void; mock.derive.mockImplementation(() => new Promise(resolve => { release = resolve; }));
  const pending = unlockVault(fixture.password); await vi.waitFor(() => expect(release).toBeDefined()); clearVaultKey(); release(correct);
  await expect(pending).rejects.toThrow(); expect(getVaultKey()).toBeNull();
});
