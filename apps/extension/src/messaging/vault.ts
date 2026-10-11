import { encryptedVaultItemSchema, type EncryptedVaultItem } from "@password-manager/shared";
import { isAuthResult, sanitizeProfile, type Profile } from "./auth";

export type VaultRequest = { type: "vault/snapshot" };
export type VaultApiError = "unauthenticated" | "unverified" | "account-changed" | "unavailable" | "invalid-response" | "timeout";
export type VaultSnapshot = { profile: Profile; vaultSalt: string; items: EncryptedVaultItem[] };
export type VaultResult = { ok: true; snapshot: VaultSnapshot } | { ok: false; error: VaultApiError };

export function isVaultRequest(value: unknown): value is VaultRequest {
  return Boolean(value && typeof value === "object" && "type" in value && value.type === "vault/snapshot" && Object.keys(value).length === 1);
}

export function parseItems(value: unknown, userId: string): EncryptedVaultItem[] | null {
  if (!Array.isArray(value) || value.length > 5000) return null;
  const items: EncryptedVaultItem[] = [];
  const ids = new Set<string>();
  for (const raw of value) {
    const parsed = encryptedVaultItemSchema.safeParse(raw);
    if (!parsed.success || parsed.data.userId !== userId || ids.has(parsed.data.id)) return null;
    ids.add(parsed.data.id); items.push(parsed.data);
  }
  return items;
}

export function parseSnapshot(value: unknown): VaultSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  const profile = sanitizeProfile(data.profile);
  if (!profile || !profile.emailVerified || typeof data.vaultSalt !== "string" || !/^[A-Za-z0-9+/]{22}==$/.test(data.vaultSalt)) return null;
  const items = parseItems(data.items, profile.id);
  return items ? { profile, vaultSalt: data.vaultSalt, items } : null;
}

export function isVaultResult(value: unknown): value is VaultResult {
  if (!value || typeof value !== "object" || !("ok" in value) || Object.keys(value).length !== 2) return false;
  if (value.ok === false && "error" in value) return typeof value.error === "string" &&
    ["unauthenticated", "unverified", "account-changed", "unavailable", "invalid-response", "timeout"].includes(value.error);
  if (value.ok !== true || !("snapshot" in value)) return false;
  const snapshot = parseSnapshot(value.snapshot);
  if (!snapshot || Object.keys(value.snapshot as object).length !== 3) return false;
  const original = value.snapshot as VaultSnapshot;
  return isAuthResult({ ok: true, state: "signed-in", profile: original.profile }) &&
    original.items.every(item => Object.keys(item).length === 6);
}
