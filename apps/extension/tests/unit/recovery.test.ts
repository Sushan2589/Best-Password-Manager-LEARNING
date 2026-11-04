import { describe, expect, it } from "vitest";
import {
  credentialVersionChanges,
  vaultEntrySchema,
  withCredentialHistory,
} from "@password-manager/shared";
const entry = {
  title: "Public fixture",
  username: "fixture",
  password: "public-fixture-password",
};
describe("encrypted payload recovery format", () => {
  it("accepts legacy payloads and nullable trash markers", () => {
    expect(vaultEntrySchema.parse(entry)).toEqual(entry);
    expect(
      vaultEntrySchema.parse({ ...entry, deletedAt: null }).deletedAt,
    ).toBeNull();
  });
  it("preserves metadata without recording favorite-only changes", () => {
    expect(withCredentialHistory(entry, { ...entry, favorite: true })).toEqual({
      ...entry,
      favorite: true,
    });
  });
  it("keeps ten nonrecursive versions and restores while retaining current content", () => {
    let current = vaultEntrySchema.parse(entry);
    for (let i = 0; i < 15; i++)
      current = withCredentialHistory(current, {
        ...current,
        password: `public-fixture-${i}`,
      });
    expect(current.history).toHaveLength(10);
    expect(current.history![0]!.entry.password).toBe("public-fixture-13");
    expect(current.history![0]!.entry).not.toHaveProperty("history");
    const restored = withCredentialHistory(current, {
      ...current,
      ...current.history![0]!.entry,
    });
    expect(restored.password).toBe("public-fixture-13");
    expect(restored.history![0]!.entry.password).toBe("public-fixture-14");
  });
});

it("does not make login permission changes into credential history and honors explicit history clearing", () => {
  expect(
    withCredentialHistory(entry, {
      ...entry,
      approvedOrigins: ["https://accounts.example.com"],
    }),
  ).not.toHaveProperty("history");
  const changed = withCredentialHistory(entry, {
    ...entry,
    password: "public-other-fixture",
  });
  expect(
    withCredentialHistory(changed, { ...changed, history: [] }).history,
  ).toEqual([]);
});

it("restores absent content fields without reviving old approvals or replacing organization",()=>{
 const current={...entry,email:"new@example.com",notes:"Added later",favorite:true,approvedOrigins:["https://accounts.example.com"]};
 const restored={...current,...credentialVersionChanges(entry)};
 expect(restored.email).toBeUndefined();expect(restored.notes).toBeUndefined();expect(restored.favorite).toBe(true);expect(restored.approvedOrigins).toEqual(current.approvedOrigins);
});
