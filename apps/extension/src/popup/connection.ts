import { CONNECTION_CHECK, isConnectionResult, type ConnectionResult } from "../messaging/protocol";

export async function requestConnectionCheck(): Promise<ConnectionResult> {
  if (!globalThis.chrome?.runtime?.id) return { ok: false, error: "unavailable" };
  try {
    const result: unknown = await chrome.runtime.sendMessage({ type: CONNECTION_CHECK });
    return isConnectionResult(result) ? result : { ok: false, error: "invalid-response" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
