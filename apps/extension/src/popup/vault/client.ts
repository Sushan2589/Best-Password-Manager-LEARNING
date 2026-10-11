import { isVaultResult, type VaultResult } from "../../messaging/vault";
import { encryptedVaultItemSchema } from "@password-manager/shared";
import type { WriteRequest, WriteResult } from "../../messaging/write";

export async function writeVault(request: WriteRequest): Promise<WriteResult> {
  try {
    const result = await chrome.runtime.sendMessage(request);
    if (result?.ok === true) { const item = encryptedVaultItemSchema.safeParse(result.item); if (item.success) return { ok: true, item: item.data }; }
    if (result?.ok === false && ["unavailable", "unauthenticated", "unverified", "account-changed", "conflict", "invalid-response"].includes(result.error)) return result;
    return { ok: false, error: "invalid-response" };
  } catch { return { ok: false, error: "unavailable" }; }
}

export async function fetchVaultSnapshot(): Promise<VaultResult> {
  try {
    const result: unknown = await chrome.runtime.sendMessage({ type: "vault/snapshot" });
    return isVaultResult(result) ? result : { ok: false, error: "invalid-response" };
  } catch { return { ok: false, error: "unavailable" }; }
}
