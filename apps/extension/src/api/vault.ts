import { sanitizeProfile } from "../messaging/auth";
import { parseSnapshot, type VaultApiError, type VaultResult } from "../messaging/vault";

class VaultRequestFailure extends Error {
  constructor(readonly code: VaultApiError) { super(code); }
}

export function createVaultApi(apiOrigin: string, fetcher: typeof fetch = fetch) {
  return async function snapshot(): Promise<VaultResult> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    async function request(path: "/user/me" | "/vault") {
      const response = await fetcher(`${apiOrigin}${path}`, { credentials: "include", cache: "no-store", redirect: "error",
        headers: { Accept: "application/json" }, signal: controller.signal });
      if (response.status === 401 || response.status === 404) throw new VaultRequestFailure("unauthenticated");
      if (response.status === 403) throw new VaultRequestFailure("unverified");
      if (!response.ok) throw new VaultRequestFailure("unavailable");
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json") || !response.body) throw new VaultRequestFailure("invalid-response");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const part = await reader.read();
          if (part.done) break;
          length += part.value.length;
          if (length > 8388608) { await reader.cancel(); throw new VaultRequestFailure("invalid-response"); }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
      try { return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)) as unknown; }
      catch { throw new VaultRequestFailure("invalid-response"); }
    }
    try {
      const initial = await request("/user/me");
      const profile = sanitizeProfile(initial);
      if (!profile) throw new VaultRequestFailure("invalid-response");
      if (!profile.emailVerified) throw new VaultRequestFailure("unverified");
      if (Date.parse(profile.sessionExpiresAt) <= Date.now()) throw new VaultRequestFailure("unauthenticated");
      const items = await request("/vault");
      const confirmed = sanitizeProfile(await request("/user/me"));
      if (!confirmed || !confirmed.emailVerified || Date.parse(confirmed.sessionExpiresAt) <= Date.now()) throw new VaultRequestFailure("unauthenticated");
      if (confirmed.id !== profile.id) throw new VaultRequestFailure("account-changed");
      const vaultSalt = (initial as Record<string, unknown>).vaultSalt;
      const result = parseSnapshot({ profile: confirmed, vaultSalt, items });
      return result ? { ok: true, snapshot: result } : { ok: false, error: "invalid-response" };
    } catch (error) {
      return { ok: false, error: controller.signal.aborted ? "timeout" : error instanceof VaultRequestFailure ? error.code : "unavailable" };
    } finally { clearTimeout(timer); }
  };
}
