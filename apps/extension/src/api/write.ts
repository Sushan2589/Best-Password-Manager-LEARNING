import { encryptedVaultItemSchema } from "@password-manager/shared";
import { sanitizeProfile } from "../messaging/auth";
import type { WriteRequest, WriteResult } from "../messaging/write";

export function createVaultWriter(apiOrigin: string, fetcher: typeof fetch = fetch) {
  return async (request: WriteRequest): Promise<WriteResult> => {
    const controller = new AbortController(); const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const session = await fetcher(`${apiOrigin}/user/me`, { credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal });
      if (!session.ok) return { ok: false, error: "unauthenticated" };
      const profile = sanitizeProfile(await session.json());
      if (!profile || Date.parse(profile.sessionExpiresAt) <= Date.now()) return { ok: false, error: "unauthenticated" };
      if (!profile.emailVerified) return { ok: false, error: "unverified" };
      if (profile.id !== request.accountId) return { ok: false, error: "account-changed" };
      const response = await fetcher(`${apiOrigin}/vault${request.itemId ? `/${request.itemId}` : ""}`, {
        method: request.itemId ? "PATCH" : "POST", credentials: "include", redirect: "error", cache: "no-store", signal: controller.signal,
        headers: { "Content-Type": "application/json", "X-Vault-Account": request.accountId },
        body: JSON.stringify({ cipherText: request.cipherText, nonce: request.nonce,
          ...(request.itemId ? { expectedCipherText: request.expectedCipherText } : {}) }),
      });
      if (!response.ok) return { ok: false, error: response.status === 401 ? "unauthenticated" : response.status === 403 ? "unverified" : response.status === 409 ? "conflict" : "unavailable" };
      if (!response.headers.get("content-type")?.includes("application/json") || !response.body) return { ok: false, error: "invalid-response" };
      const reader = response.body.getReader(); let text = ""; const decoder = new TextDecoder();
      try { for (;;) { const part = await reader.read(); if (part.done) break; text += decoder.decode(part.value, { stream: true });
        if (text.length > 1100000) { await reader.cancel(); throw new Error("Oversized response."); } } text += decoder.decode(); }
      finally { reader.releaseLock(); }
      const item = encryptedVaultItemSchema.safeParse(JSON.parse(text));
      if (!item.success || item.data.userId !== request.accountId || item.data.cipherText !== request.cipherText || item.data.nonce !== request.nonce ||
        request.itemId && item.data.id !== request.itemId) return { ok: false, error: "invalid-response" };
      return { ok: true, item: item.data };
    } catch { return { ok: false, error: "unavailable" }; }
    finally { clearTimeout(timer); }
  };
}
