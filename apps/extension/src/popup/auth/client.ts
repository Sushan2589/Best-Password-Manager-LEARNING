import { isAuthResult, type AuthRequest, type AuthResult } from "../../messaging/auth";

export async function authRequest(message: AuthRequest): Promise<AuthResult> {
  try {
    const result: unknown = await chrome.runtime.sendMessage(message);
    return isAuthResult(result) ? result : { ok: false, error: "invalid-response" };
  } catch { return { ok: false, error: "unavailable" }; }
}
