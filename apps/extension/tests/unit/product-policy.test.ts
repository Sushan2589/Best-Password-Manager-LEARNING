import { describe, expect, it } from "vitest";
import { newMasterPasswordSchema, vaultEntrySchema } from "@password-manager/shared";
describe("master password length policy", () => {
  it.each([[9, false], [10, true], [24, true]])("accepts length %i: %s", (length, accepted) => {
    expect(newMasterPasswordSchema.safeParse("x".repeat(length)).success).toBe(accepted);
  });
  it("counts unicode characters and limits oversized input", () => {
    expect(newMasterPasswordSchema.safeParse("🔑".repeat(9)).success).toBe(false);
    expect(newMasterPasswordSchema.safeParse("🔑".repeat(10)).success).toBe(true);
    expect(newMasterPasswordSchema.safeParse("x".repeat(1025)).success).toBe(false);
  });
  it("preserves legacy entries and allows short website passwords", () => {
    const entry = { title: "Public fixture", username: "fixture", password: "x" };
    expect(vaultEntrySchema.parse(entry)).toEqual(entry);
    expect(vaultEntrySchema.parse({ ...entry, favorite: true, folder: "Work", tags: ["Test"] })).toMatchObject({ favorite: true, folder: "Work", tags: ["Test"] });
  });
});
