import { describe, expect, it } from "vitest";
import { vaultEntrySchema } from "@password-manager/shared";
import { canOfferLoginOrigin, matchesCredential } from "../../src/popup/sites/matching";

describe("explicit encrypted login origins", () => {
  const entry = { title: "Google", username: "fixture", password: "public", website: "https://google.com" };
  it("offers Google's login hostname without allowing it before approval", () => {
    expect(canOfferLoginOrigin(entry.website, "https://accounts.google.com/signin")).toBe(true);
    expect(matchesCredential(entry, "https://accounts.google.com")).toBe(false);
    const approved = { ...entry, approvedOrigins: ["https://accounts.google.com"] };
    expect(matchesCredential(approved, "https://accounts.google.com/signin")).toBe(true);
    expect(matchesCredential(approved, "https://google.com/login")).toBe(true);
    for (const target of ["https://mail.google.com", "https://accounts.google.com.evil.com", "https://notgoogle.com", "http://accounts.google.com", "https://accounts.google.com:8443"]) expect(matchesCredential(approved, target)).toBe(false);
  });
  it.each(["https://google.com.evil.com", "https://evilgoogle.com", "https://evil.com/accounts.google.com", "http://accounts.google.com", "https://accounts.google.com:8443", "https://user@accounts.google.com", "https://foo.google.com"])("does not offer %s", target => {
    expect(canOfferLoginOrigin(entry.website, target)).toBe(false);
  });
  it("offers only the exact www pair, never arbitrary subdomains", () => {
    expect(canOfferLoginOrigin("https://facebook.com", "https://www.facebook.com/login")).toBe(true);
    expect(matchesCredential({ website: "https://facebook.com" }, "https://www.facebook.com")).toBe(false);
    expect(canOfferLoginOrigin("https://example.com", "https://accounts.example.com")).toBe(false);
    expect(canOfferLoginOrigin("https://example.com", "https://www.example.com.evil.com")).toBe(false);
  });
  it("reads legacy entries and accepts only canonical HTTPS approval origins", () => {
    expect(vaultEntrySchema.parse(entry)).toEqual(entry);
    expect(vaultEntrySchema.safeParse({ ...entry, approvedOrigins: ["https://accounts.google.com"] }).success).toBe(true);
    for (const origin of ["http://accounts.google.com", "https://accounts.google.com/", "https://accounts.google.com/path", "https://user@accounts.google.com", "https://ACCOUNTS.google.com", "javascript:alert(1)"]) {
      expect(vaultEntrySchema.safeParse({ ...entry, approvedOrigins: [origin] }).success).toBe(false);
      expect(matchesCredential({ ...entry, approvedOrigins: [origin] }, "https://accounts.google.com")).toBe(false);
    }
    expect(vaultEntrySchema.safeParse({ ...entry, approvedOrigins: Array(21).fill("https://accounts.google.com") }).success).toBe(false);
  });
});
