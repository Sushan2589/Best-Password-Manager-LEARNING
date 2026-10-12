export type Profile = { id: string; email: string; name: string | null; emailVerified: boolean; sessionExpiresAt: string };
export type AuthError = "mfa-required" | "invalid-credentials" | "invalid-input" | "unavailable" | "timeout" | "invalid-response" | "forbidden" | "cookie-unavailable" | "rate-limited";
export type AuthRequest = { type: "auth/session" | "auth/logout" | "auth/resend" } | { type: "auth/login"; email: string; password: string; code?: string };
export type AuthResult =
  | { ok: true; state: "signed-out" | "verification-sent" }
  | { ok: true; state: "signed-in"; profile: Profile }
  | { ok: false; error: AuthError };

export function isAuthRequest(value: unknown): value is AuthRequest {
  if (!value || typeof value !== "object" || !("type" in value)) return false;
  if (typeof value.type === "string" && ["auth/session", "auth/logout", "auth/resend"].includes(value.type)) return Object.keys(value).length === 1;
  return value.type === "auth/login" && (Object.keys(value).length === 3 || Object.keys(value).length === 4 && "code" in value && typeof value.code === "string" && value.code.length <= 35) && "email" in value && "password" in value &&
    typeof value.email === "string" && value.email.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.email) &&
    typeof value.password === "string" && value.password.length >= 6 && value.password.length <= 1024;
}

// Copy only allowed fields: no salts, tokens, password hashes, or arbitrary server data.
export function sanitizeProfile(value: unknown): Profile | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (typeof data.id !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id) ||
      typeof data.email !== "string" || data.email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) ||
      !(data.name === null || (typeof data.name === "string" && data.name.length <= 255)) ||
      typeof data.emailVerified !== "boolean" || typeof data.sessionExpiresAt !== "string" ||
      !Number.isFinite(Date.parse(data.sessionExpiresAt))) return null;
  return { id: data.id, email: data.email, name: data.name, emailVerified: data.emailVerified, sessionExpiresAt: data.sessionExpiresAt };
}

export function isAuthResult(value: unknown): value is AuthResult {
  if (!value || typeof value !== "object" || !("ok" in value)) return false;
  if (value.ok === false && "error" in value && Object.keys(value).length === 2) {
    return typeof value.error === "string" && ["mfa-required", "invalid-credentials", "invalid-input", "unavailable", "timeout", "invalid-response", "forbidden", "cookie-unavailable", "rate-limited"].includes(value.error);
  }
  if (value.ok === true && "state" in value) {
    if (value.state === "signed-in" && "profile" in value && Object.keys(value).length === 3) {
      const profile = sanitizeProfile(value.profile);
      return profile !== null && Object.keys(value.profile as object).length === 5;
    }
    return Object.keys(value).length === 2 && typeof value.state === "string" && ["signed-out", "verification-sent"].includes(value.state);
  }
  return false;
}
