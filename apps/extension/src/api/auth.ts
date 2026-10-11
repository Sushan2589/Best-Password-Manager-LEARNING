import { sanitizeProfile, type AuthRequest, type AuthResult } from "../messaging/auth";

class RequestFailure extends Error {
  constructor(readonly code: "timeout" | "unavailable" | "invalid-response") { super(code); }
}

export function createAuthApi(apiOrigin: string, fetcher: typeof fetch = fetch) {
  async function request(path: "/user/me" | "/auth/login" | "/auth/logout" | "/auth/resend-verification", body?: object) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetcher(`${apiOrigin}${path}`, {
        method: path === "/user/me" ? "GET" : "POST",
        credentials: "include", cache: "no-store", redirect: "error", signal: controller.signal,
        headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!response.headers.get("content-type")?.toLowerCase().includes("application/json")) throw new RequestFailure("invalid-response");
      // Keep the timeout active while reading the body too.
      const data: unknown = await response.json();
      return { status: response.status, data };
    } catch (error) {
      if (controller.signal.aborted) throw new RequestFailure("timeout");
      if (error instanceof RequestFailure) throw error;
      if (error instanceof SyntaxError) throw new RequestFailure("invalid-response");
      throw new RequestFailure("unavailable");
    } finally { clearTimeout(timeout); }
  }

  function failure(status: number): AuthResult {
    return { ok: false, error: status === 429 ? "rate-limited" : status === 403 ? "forbidden" : status === 400 ? "invalid-input" : "unavailable" };
  }

  async function session(): Promise<AuthResult> {
    const response = await request("/user/me");
    if (response.status === 401 || response.status === 404) return { ok: true, state: "signed-out" };
    if (response.status !== 200) return failure(response.status);
    const profile = sanitizeProfile(response.data);
    if (!profile) return { ok: false, error: "invalid-response" };
    if (Date.parse(profile.sessionExpiresAt) <= Date.now()) return { ok: true, state: "signed-out" };
    return { ok: true, state: "signed-in", profile };
  }

  return async function execute(message: AuthRequest): Promise<AuthResult> {
    try {
      if (message.type === "auth/session") return await session();
      if (message.type === "auth/login") {
        const login = await request("/auth/login", { email: message.email, password: message.password });
        if (login.status === 401) return { ok: false, error: "invalid-credentials" };
        if (login.status !== 200) return failure(login.status);
        const verifiedCookie = await session();
        return verifiedCookie.ok && verifiedCookie.state === "signed-out" ? { ok: false, error: "cookie-unavailable" } : verifiedCookie;
      }
      if (message.type === "auth/logout") {
        const result = await request("/auth/logout");
        return result.status === 200 || result.status === 401 ? { ok: true, state: "signed-out" } : failure(result.status);
      }
      // Resolve email from the authenticated session, not an untrusted caller's payload.
      const current = await session();
      if (!current.ok || current.state !== "signed-in") return current;
      if (current.profile.emailVerified) return current;
      const response = await request("/auth/resend-verification", { email: current.profile.email });
      return response.status === 200 ? { ok: true, state: "verification-sent" } : failure(response.status);
    } catch (error) {
      return { ok: false, error: error instanceof RequestFailure ? error.code : "unavailable" };
    }
  };
}
