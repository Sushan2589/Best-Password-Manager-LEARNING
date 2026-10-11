import type { ConnectionResult } from "../messaging/protocol";

// A read-only connectivity probe, not a login or authenticated-profile cache.
// Responses never cross the messaging boundary with account data attached.
export async function checkConnection(apiOrigin: string, fetcher: typeof fetch = fetch): Promise<ConnectionResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetcher(`${apiOrigin}/user/me`, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "error",
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    await response.body?.cancel();
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) {
      return { ok: false, error: "invalid-response" };
    }
    if (response.status === 200) return { ok: true, state: "reachable" };
    if (response.status === 401) return { ok: true, state: "no-session" };
    if (response.status === 403) return { ok: true, state: "restricted" };
    return { ok: false, error: "unavailable" };
  } catch {
    return { ok: false, error: controller.signal.aborted ? "timeout" : "unavailable" };
  } finally {
    clearTimeout(timeout);
  }
}
