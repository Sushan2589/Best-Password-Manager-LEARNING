import { describe, expect, it, vi } from "vitest";
import { decrypt, deriveCryptoKey } from "@password-manager/crypto";
import fixture from "../fixtures/legacy-vault.json";
import { copyCredential, openCredentialWebsite, safeWebsiteUrl, searchCredentials, websiteLabel } from "../../src/popup/vault/credentials";
import { VaultSession } from "../../src/popup/vault/session";
import type { DecryptedVaultItem } from "@password-manager/shared";

const credential: DecryptedVaultItem = { ...fixture.entry, id: "00000000-0000-4000-8000-000000000002",
  email: "fixture@example.com", notes: "private-note", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
const profile = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString() };

describe("credential search", () => {
  const other = { ...credential, id: "other", title: "Another account", username: undefined, email: "second@example.com", website: undefined };
  it.each([["FIXTURE", 1], [" example.com ", 2], ["second@", 1], ["not-found", 0], [fixture.entry.password, 0], ["private-note", 0]])("searches only account metadata: %s", (query, count) => {
    expect(searchCredentials([credential, other], query)).toHaveLength(count);
  });
  it("keeps multiple accounts and sorts a copy without mutating the vault", () => {
    const input = [credential, other];
    expect(searchCredentials(input, "").map(item => item.id)).toEqual([other.id, credential.id]);
    expect(input[0]).toBe(credential);
  });
});

describe("website navigation", () => {
  it.each(["javascript:alert(1)", "data:text/html,<script>alert(1)</script>", "file:///secret", "chrome://settings", "chrome-extension://some-id/popup.html",
    "mailto:user@example.com", "https://user:pass@example.com", "https://example.com@evil.com", "https://example.com\n.evil.com", "not a url", "", undefined])("rejects unsafe URLs: %s", value => {
    expect(safeWebsiteUrl(value)).toBeNull();
  });
  it("normalizes HTTP(S) and exposes ASCII hostnames", () => {
    expect(safeWebsiteUrl("https://EXAMPLE.com:443/login")).toBe("https://example.com/login");
    expect(safeWebsiteUrl("http://localhost:3000/login")).toBe("http://localhost:3000/login");
    expect(websiteLabel("https://bücher.example")).toBe("xn--bcher-kva.example");
    expect(websiteLabel(undefined)).toBe("No website saved");
  });
  it("opens only the saved URL, with no appended login or password", async () => {
    const open = vi.fn().mockResolvedValue(undefined);
    await openCredentialWebsite(credential.id, () => credential, open);
    expect(open).toHaveBeenCalledExactlyOnceWith("https://example.com/");
  });
  it("does not open missing, unsafe, or locked credentials", async () => {
    const open = vi.fn();
    for (const read of [() => null, () => ({ ...credential, website: "javascript:alert(1)" }), () => ({ ...credential, website: undefined })]) {
      await expect(openCredentialWebsite(credential.id, read, open)).rejects.toThrow("Website unavailable");
    }
    expect(open).not.toHaveBeenCalled();
  });
});

describe("explicit clipboard actions", () => {
  it.each(["username", "email", "password"] as const)("copies only the chosen %s field", async field => {
    const write = vi.fn().mockResolvedValue(undefined);
    await copyCredential(credential.id, field, () => credential, write);
    expect(write).toHaveBeenCalledExactlyOnceWith(credential[field]);
  });
  it("does not copy after lock or when an optional field is missing", async () => {
    const write = vi.fn();
    await expect(copyCredential(credential.id, "password", () => null, write)).rejects.toThrow("Copy unavailable");
    await expect(copyCredential(credential.id, "username", () => ({ ...credential, username: undefined }), write)).rejects.toThrow("Copy unavailable");
    expect(write).not.toHaveBeenCalled();
  });
  it("sanitizes clipboard failures", async () => {
    await expect(copyCredential(credential.id, "password", () => credential, vi.fn().mockRejectedValue(new Error("private OS diagnostic")))).rejects.toThrow(/^Copy unavailable\.$/);
  });
});

describe("popup-only credential access", () => {
  it("provides metadata summaries and revokes reads on lock", async () => {
    const key = await deriveCryptoKey(fixture.password, fixture.salt);
    const session = new VaultSession({ snapshot: async () => ({ ok: true, snapshot: { profile, vaultSalt: fixture.salt,
      items: [{ ...credential, userId: profile.id, cipherText: fixture.cipherText, nonce: fixture.nonce }] } }),
      validateSession: async () => ({ ok: true, state: "signed-in", profile }), derive: async () => key, decrypt });
    session.setAccount(profile);
    expect(session.listCredentials()).toEqual([]); expect(session.readCredential(credential.id)).toBeNull();
    await session.unlock(fixture.password);
    expect(session.listCredentials()[0]).not.toHaveProperty("password");
    expect(session.listCredentials()[0]).not.toHaveProperty("notes");
    const selected = session.readCredential(credential.id)!; selected.password = "mutated-copy";
    expect(session.readCredential(credential.id)?.password).toBe(fixture.entry.password);
    session.lock(); expect(session.listCredentials()).toEqual([]); expect(session.readCredential(credential.id)).toBeNull();
  });
});
