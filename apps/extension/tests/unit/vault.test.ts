import { beforeAll, describe, expect, it, vi } from "vitest";
import { createVaultVerifier, decrypt, deriveCryptoKey, deriveVaultKey, encrypt } from "@password-manager/crypto";
import { decrypt as webDecrypt, encrypt as webEncrypt } from "../../../web/src/lib/crypto/encryption";
import { deriveVaultKey as webDerive } from "../../../web/src/lib/crypto/key";
import fixture from "../fixtures/legacy-vault.json";
import { createVaultApi } from "../../src/api/vault";
import { handleMessage } from "../../src/background/handler";
import { isVaultRequest, isVaultResult, parseSnapshot } from "../../src/messaging/vault";
import { VaultSession } from "../../src/popup/vault/session";
import type { AuthResult } from "../../src/messaging/auth";
import type { VaultResult } from "../../src/messaging/vault";

const profile = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };
const item = { id: "00000000-0000-4000-8000-000000000002", userId: profile.id,
  cipherText: fixture.cipherText, nonce: fixture.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const snapshot = { profile, vaultSalt: fixture.salt, items: [item] };
const signedIn: AuthResult = { ok: true, state: "signed-in", profile };
let key: CryptoKey;
beforeAll(async () => { key = await crypto.subtle.importKey("raw", Buffer.from(fixture.keyHex, "hex"), "AES-GCM", false, ["encrypt", "decrypt"]); });
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; }
function setup() {
  const dependencies = { snapshot: vi.fn<() => Promise<VaultResult>>().mockResolvedValue({ ok: true, snapshot }),
    validateSession: vi.fn<() => Promise<AuthResult>>().mockResolvedValue(signedIn), derive: vi.fn<typeof deriveCryptoKey>().mockImplementation(async () => key) };
  const session = new VaultSession(dependencies); session.setAccount(profile);
  return { session, dependencies };
}

describe("legacy crypto compatibility", () => {
  it("preserves a fixed native Argon2id vector, including the salt string interpretation", async () => {
    const raw = await deriveVaultKey(fixture.password, fixture.salt);
    expect(Buffer.from(raw).toString("hex")).toBe(fixture.keyHex); raw.fill(0);
    const web = await webDerive(fixture.password, fixture.salt);
    expect(Buffer.from(web).toString("hex")).toBe(fixture.keyHex); web.fill(0);
  });
  it("decrypts a frozen legacy-format AES-GCM fixture", async () => {
    expect(JSON.parse(await decrypt(fixture.cipherText, fixture.nonce, key))).toEqual(fixture.entry);
  });
  it("web encrypts/extension decrypts and extension encrypts/web decrypts", async () => {
    const first = await webEncrypt(JSON.stringify(fixture.entry), key);
    expect(await decrypt(first.cipherText, first.nonce, key)).toBe(JSON.stringify(fixture.entry));
    const second = await encrypt(JSON.stringify(fixture.entry), key);
    expect(await webDecrypt(second.cipherText, second.nonce, key)).toBe(JSON.stringify(fixture.entry));
    expect(first.nonce).not.toBe(second.nonce);
  });
  it("derives non-extractable AES-256 keys and rejects wrong passwords", async () => {
    const wrong = await deriveCryptoKey("wrong-vault-password", fixture.salt);
    expect(wrong.extractable).toBe(false); expect(wrong.algorithm).toMatchObject({ name: "AES-GCM", length: 256 });
    await expect(crypto.subtle.exportKey("raw", wrong)).rejects.toThrow();
    await expect(decrypt(fixture.cipherText, fixture.nonce, wrong)).rejects.toThrow();
  });
  it("rejects tampered ciphertext", async () => {
    const bytes = Buffer.from(fixture.cipherText, "base64"); bytes[0] = bytes[0]! ^ 1;
    await expect(decrypt(bytes.toString("base64"), fixture.nonce, key)).rejects.toThrow();
  });
  it.each(["bad-base64", "", Buffer.alloc(11).toString("base64"), Buffer.alloc(13).toString("base64")])("rejects invalid nonce %s", async nonce => {
    await expect(decrypt(fixture.cipherText, nonce, key)).rejects.toThrow();
  });
  it("rejects invalid UTF-8 despite valid authentication", async () => {
    const iv = new Uint8Array(12);
    const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new Uint8Array([255]));
    await expect(decrypt(Buffer.from(ciphertext).toString("base64"), Buffer.from(iv).toString("base64"), key)).rejects.toThrow();
  });
});

describe("popup vault lifecycle", () => {
  it("accepts a key only after every entry and the current session validate", async () => {
    const { session, dependencies } = setup();
    await session.unlock(fixture.password);
    expect(session.getSnapshot()).toEqual({ status: "unlocked", count: 1, error: null });
    expect(session.hasKey()).toBe(true); expect(dependencies.validateSession).toHaveBeenCalledOnce();
    expect(JSON.stringify(session.getSnapshot())).not.toContain(fixture.entry.password);
    session.lock(); expect(session.hasKey()).toBe(false); expect(session.getSnapshot().count).toBe(0);
  });
  it("locks on a key-version change even when a fresh sign-in belongs to the same account", async () => {
    const { session, dependencies } = setup(); await session.unlock(fixture.password);
    dependencies.validateSession.mockResolvedValue({ ok: true, state: "signed-in", profile: { ...profile, vaultKeyVersion: 1 } });
    expect(await session.authorizeAction()).toBe(false); expect(session.hasKey()).toBe(false); expect(session.listCredentials()).toEqual([]);
    session.setAccount({ ...profile, vaultKeyVersion: 1 });
    dependencies.snapshot.mockResolvedValue({ ok: true, snapshot: { ...snapshot, profile: { ...profile, vaultKeyVersion: 1 } } });
    await session.unlock(fixture.password); expect(session.hasKey()).toBe(true); expect(await session.authorizeAction()).toBe(true); session.lock();
    const other = setup(); await other.session.unlock(fixture.password);
    other.session.setAccount({ ...profile, vaultKeyVersion: 1 }); expect(other.session.hasKey()).toBe(false);
  });
  it("rejects a key version changing during unlock and a salt changing between snapshot reads", async () => {
    const { session, dependencies } = setup();
    dependencies.validateSession.mockResolvedValue({ ok: true, state: "signed-in", profile: { ...profile, vaultKeyVersion: 1 } });
    await session.unlock(fixture.password); expect(session.hasKey()).toBe(false);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ...profile, vaultSalt: fixture.salt }))
      .mockResolvedValueOnce(json([item])).mockResolvedValueOnce(json({ ...profile, vaultSalt: btoa("different salt!!") }));
    expect(await createVaultApi("https://api.example.com", fetcher)()).toEqual({ ok: false, error: "account-changed" });
  });
  it("keeps empty legacy vaults locked without deriving or creating a password verifier", async () => {
    const { session, dependencies } = setup(); dependencies.snapshot.mockResolvedValue({ ok: true, snapshot: { ...snapshot, items: [] } });
    await session.unlock(fixture.password);
    expect(session.getSnapshot().error).toBe("empty-vault"); expect(session.hasKey()).toBe(false); expect(dependencies.derive).not.toHaveBeenCalled();
  });
  it("unlocks an empty initialized vault only with an owner-bound encrypted verifier", async () => {
    const { session, dependencies } = setup();
    const verifier = await createVaultVerifier(key, profile.id);
    dependencies.snapshot.mockResolvedValue({ ok: true, snapshot: { ...snapshot, items: [], verifier } });
    await session.unlock(fixture.password); expect(session.hasKey()).toBe(true); session.lock();
    const wrong = await createVaultVerifier(key, item.id);
    dependencies.snapshot.mockResolvedValue({ ok: true, snapshot: { ...snapshot, items: [], verifier: wrong } });
    await session.unlock(fixture.password); expect(session.hasKey()).toBe(false);
  });
  it("does not retain a partially decrypted vault when a later entry is invalid", async () => {
    const { session, dependencies } = setup();
    const invalid = await encrypt(JSON.stringify({ title: "Invalid", password: "missing-username" }), key);
    dependencies.snapshot.mockResolvedValue({ ok: true, snapshot: { ...snapshot, items: [item, { ...item, ...invalid }] } });
    await session.unlock(fixture.password);
    expect(session.getSnapshot()).toEqual({ status: "locked", count: 0, error: "unlock-failed" }); expect(session.hasKey()).toBe(false);
  });
  it.each([null, { ...profile, id: item.id }, { ...profile, emailVerified: false }, { ...profile, sessionExpiresAt: new Date(0).toISOString() }])("clears secrets on session loss, switch, verification loss, or expiry", async next => {
    const { session } = setup(); await session.unlock(fixture.password); session.setAccount(next);
    expect(session.getSnapshot().status).toBe("locked"); expect(session.hasKey()).toBe(false); expect(session.getSnapshot().count).toBe(0);
  });
  it("ignores a snapshot arriving after manual lock", async () => {
    const { session, dependencies } = setup(); const pending = deferred<VaultResult>(); dependencies.snapshot.mockReturnValue(pending.promise);
    const unlocking = session.unlock(fixture.password); session.lock(); pending.resolve({ ok: true, snapshot }); await unlocking;
    expect(session.hasKey()).toBe(false); expect(session.getSnapshot().status).toBe("locked"); expect(dependencies.derive).not.toHaveBeenCalled();
  });
  it("discards a key arriving after cancellation during derivation", async () => {
    const { session, dependencies } = setup(); const pending = deferred<CryptoKey>(); dependencies.derive.mockReturnValue(pending.promise);
    const unlocking = session.unlock(fixture.password); await vi.waitFor(() => expect(dependencies.derive).toHaveBeenCalled());
    session.lock(); pending.resolve(key); await unlocking;
    expect(session.hasKey()).toBe(false); expect(dependencies.validateSession).not.toHaveBeenCalled();
  });
  it("discards decrypted entries after cancellation during final session validation", async () => {
    const { session, dependencies } = setup(); const pending = deferred<AuthResult>(); dependencies.validateSession.mockReturnValue(pending.promise);
    const unlocking = session.unlock(fixture.password); await vi.waitFor(() => expect(dependencies.validateSession).toHaveBeenCalled());
    session.lock(); pending.resolve(signedIn); await unlocking;
    expect(session.hasKey()).toBe(false); expect(session.getSnapshot().count).toBe(0);
  });
  it.each<AuthResult>([{ ok: true, state: "signed-out" }, { ok: true, state: "signed-in", profile: { ...profile, id: item.id } },
    { ok: true, state: "signed-in", profile: { ...profile, emailVerified: false } }, { ok: false, error: "unavailable" }])("fails closed when final revalidation rejects the account", async result => {
    const { session, dependencies } = setup(); dependencies.validateSession.mockResolvedValue(result);
    await session.unlock(fixture.password); expect(session.hasKey()).toBe(false); expect(session.getSnapshot().status).toBe("locked");
  });
  it("a new popup instance cannot inherit an unlocked key", async () => {
    const old = setup(); await old.session.unlock(fixture.password);
    const reopened = setup(); expect(reopened.session.hasKey()).toBe(false); expect(reopened.session.getSnapshot().status).toBe("locked"); old.session.lock();
  });
});

describe("encrypted snapshot boundary", () => {
  it("uses only read-only, fixed, credentialed paths and strips arbitrary data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ...profile, vaultSalt: fixture.salt, passwordHash: "never-forward" }))
      .mockResolvedValueOnce(json([{ ...item, secret: "never-forward" }])).mockResolvedValueOnce(json({ ...profile, vaultSalt: fixture.salt }));
    expect(await createVaultApi("https://api.example.com", fetcher)()).toEqual({ ok: true, snapshot });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://api.example.com/user/me", "https://api.example.com/vault", "https://api.example.com/user/me"]);
    for (const [, options] of fetcher.mock.calls) { expect(options).toMatchObject({ credentials: "include", cache: "no-store", redirect: "error" }); expect(options?.body).toBeUndefined(); }
  });
  it.each([[401, "unauthenticated"], [403, "unverified"], [500, "unavailable"]] as const)("sanitizes HTTP %s", async (status, error) => {
    expect(await createVaultApi("https://api.example.com", vi.fn<typeof fetch>().mockResolvedValue(json({ debug: "private" }, status)))()).toEqual({ ok: false, error });
  });
  it("never fetches encrypted entries for unverified accounts", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...profile, emailVerified: false, vaultSalt: fixture.salt }));
    expect(await createVaultApi("https://api.example.com", fetcher)()).toEqual({ ok: false, error: "unverified" }); expect(fetcher).toHaveBeenCalledOnce();
  });
  it("rejects account changes between API reads", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ...profile, vaultSalt: fixture.salt })).mockResolvedValueOnce(json([item])).mockResolvedValueOnce(json({ ...profile, id: item.id }));
    expect(await createVaultApi("https://api.example.com", fetcher)()).toEqual({ ok: false, error: "account-changed" });
  });
  it("rejects foreign, duplicated, malformed records and missing salts", () => {
    expect(parseSnapshot({ ...snapshot, items: [{ ...item, userId: item.id }] })).toBeNull();
    expect(parseSnapshot({ ...snapshot, items: [item, item] })).toBeNull();
    expect(parseSnapshot({ ...snapshot, items: [{ ...item, nonce: "invalid" }] })).toBeNull();
    expect(parseSnapshot({ ...snapshot, vaultSalt: undefined })).toBeNull();
    expect(isVaultResult({ ok: true, snapshot: { ...snapshot, password: "secret" } })).toBe(false);
  });
  it("denies content scripts and forbids vault passwords in messages", async () => {
    const vault = vi.fn();
    expect(await handleMessage({ type: "vault/snapshot" }, { id: "trusted", url: "https://evil.example" }, "trusted", "chrome-extension://trusted/popup.html", vi.fn(), undefined, vault)).toEqual({ ok: false, error: "forbidden" });
    expect(vault).not.toHaveBeenCalled(); expect(isVaultRequest({ type: "vault/snapshot", password: fixture.password })).toBe(false);
  });
});
