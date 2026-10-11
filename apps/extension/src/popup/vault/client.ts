import { isVaultResult, type VaultResult } from "../../messaging/vault";

export async function fetchVaultSnapshot(): Promise<VaultResult> {
  try {
    const result: unknown = await chrome.runtime.sendMessage({ type: "vault/snapshot" });
    return isVaultResult(result) ? result : { ok: false, error: "invalid-response" };
  } catch { return { ok: false, error: "unavailable" }; }
}
