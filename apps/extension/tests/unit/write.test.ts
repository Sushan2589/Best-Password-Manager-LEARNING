import { describe, expect, it, vi } from "vitest";
import { decrypt, deriveCryptoKey } from "@password-manager/crypto";
import { VaultSession } from "../../src/popup/vault/session";
import { createVaultWriter } from "../../src/api/write";
import { handleMessage } from "../../src/background/handler";
import { writeRequestSchema } from "../../src/messaging/write";
import fixture from "../fixtures/legacy-vault.json";

const profile = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com", emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };
const item = { id: "00000000-0000-4000-8000-000000000002", userId: profile.id, cipherText: fixture.cipherText, nonce: fixture.nonce, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const request = { type: "vault/write" as const, accountId: profile.id, cipherText: fixture.cipherText, nonce: fixture.nonce };

describe("encrypted writes", () => {
  it("validates protocol and rejects plaintext or arbitrary URLs", () => {
    expect(writeRequestSchema.safeParse({ ...request, password: "private" }).success).toBe(false);
    expect(writeRequestSchema.safeParse({ ...request, url: "https://evil.com" }).success).toBe(false);
    expect(writeRequestSchema.safeParse({ ...request, itemId: item.id }).success).toBe(false);
  });
  it("rejects content-script senders before dispatching a write", async () => {
    const write = vi.fn();
    await handleMessage(request, { id: "trusted", url: "https://example.com" }, "trusted", "chrome-extension://trusted/popup.html", vi.fn(), undefined, undefined, write);
    expect(write).not.toHaveBeenCalled();
  });
  it("uses fixed create/update endpoints, binds account, and sends ciphertext only", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async url => new Response(JSON.stringify(String(url).endsWith("/user/me") ? profile : item), { headers: { "content-type": "application/json" } }));
    const write = createVaultWriter("https://api.example.com", fetcher);
    expect((await write(request)).ok).toBe(true);
    expect(fetcher.mock.calls[1]).toEqual(["https://api.example.com/vault", expect.objectContaining({ method: "POST", headers: { "Content-Type": "application/json", "X-Vault-Account": profile.id }, body: JSON.stringify({ cipherText: fixture.cipherText, nonce: fixture.nonce }) })]);
    await write({ ...request, itemId: item.id, expectedCipherText: fixture.cipherText });
    expect(fetcher.mock.calls[3]?.[0]).toBe(`https://api.example.com/vault/${item.id}`);
    expect(fetcher.mock.calls[3]?.[1]?.method).toBe("PATCH");
  });
  it("denies account switches and preserves conflict errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ ...profile, id: "00000000-0000-4000-8000-000000000099" }), { headers: { "content-type": "application/json" } }));
    expect(await createVaultWriter("https://api.example.com", fetcher)(request)).toEqual({ ok: false, error: "account-changed" });
    expect(fetcher).toHaveBeenCalledOnce();
    fetcher.mockReset().mockResolvedValueOnce(new Response(JSON.stringify(profile))).mockResolvedValueOnce(new Response("{}", { status: 409 }));
    expect(await createVaultWriter("https://api.example.com", fetcher)(request)).toEqual({ ok: false, error: "conflict" });
  });
  it("encrypts locally, preserves compatibility, and updates the unlocked list", async () => {
    const key = await deriveCryptoKey(fixture.password, fixture.salt);
    const write = vi.fn().mockImplementation(async encrypted => ({ ok: true, item: { ...item, cipherText: encrypted.cipherText, nonce: encrypted.nonce } }));
    const session = new VaultSession({ snapshot: async () => ({ ok: true, snapshot: { profile, vaultSalt: fixture.salt, items: [item] } }),
      validateSession: async () => ({ ok: true, state: "signed-in", profile }), derive: async () => key, write });
    session.setAccount(profile); await session.unlock(fixture.password);
    const entry = { ...fixture.entry, password: "new-public-fixture-password" };
    expect((await session.saveEntry(entry, item.id)).ok).toBe(true);
    const sent = write.mock.calls[0]![0];
    expect(JSON.stringify(sent)).not.toContain(entry.password); expect(sent.expectedCipherText).toBe(fixture.cipherText);
    expect(JSON.parse(await decrypt(sent.cipherText, sent.nonce, key))).toEqual(entry);
    expect(session.readCredential(item.id)?.password).toBe(entry.password);
    session.lock(); expect((await session.saveEntry(entry)).ok).toBe(false); expect(write).toHaveBeenCalledOnce();
  });
  it("denies late authorization after locking", async () => {
    const key = await deriveCryptoKey(fixture.password, fixture.salt);
    let release!: (value: unknown) => void;
    let delayed = false;
    const validate = vi.fn().mockImplementation(() => delayed ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: true, state: "signed-in", profile }));
    const write = vi.fn();
    const session = new VaultSession({ snapshot: async () => ({ ok: true, snapshot: { profile, vaultSalt: fixture.salt, items: [item] } }), validateSession: validate, derive: async () => key, write });
    session.setAccount(profile); await session.unlock(fixture.password); delayed = true;
    const pending = session.saveEntry(fixture.entry); session.lock(); release({ ok: true, state: "signed-in", profile });
    expect((await pending).ok).toBe(false); expect(write).not.toHaveBeenCalled();
  });
});
