import { describe, expect, it, vi } from "vitest";
import { createAuthApi } from "../../src/api/auth";
import { handleMessage } from "../../src/background/handler";
import { isAuthRequest, isAuthResult } from "../../src/messaging/auth";
import { securityConfig } from "../../../api/src/config/security";
import { trustedOrigin } from "../../../api/src/middleware/trustedOrigin";
import { Hono } from "hono";
import { DEVELOPMENT_EXTENSION_ORIGIN } from "../../../../config/extension-identity";

const profile = {
  id: "00000000-0000-4000-8000-000000000001", email: "test@example.com", name: "Test",
  emailVerified: true, sessionExpiresAt: new Date(Date.now() + 3600000).toISOString(),
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("cookie authentication transport", () => {
  it("forwards only a validated public vault-key version for lifecycle checks", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...profile, vaultKeyVersion: 2, vaultSalt: "never-forward", passwordHash: "never-forward" }));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/session" })).toEqual({ ok: true, state: "signed-in", profile: { ...profile, vaultKeyVersion: 2 } });
    expect(isAuthResult({ ok: true, state: "signed-in", profile: { ...profile, vaultKeyVersion: 2 } })).toBe(true);
    for (const value of [-1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) {
      fetcher.mockResolvedValue(json({ ...profile, vaultKeyVersion: value }));
      expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/session" })).toEqual({ ok: false, error: "invalid-response" });
    }
  });
  it("confirms login using the cookie instead of trusting the login payload", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ user: profile })).mockResolvedValueOnce(json({ ...profile, vaultSalt: "not-forwarded", sessionToken: "not-forwarded" }));
    const result = await createAuthApi("https://api.example.com", fetcher)({ type: "auth/login", email: profile.email, password: "test-password" });
    expect(result).toEqual({ ok: true, state: "signed-in", profile });
    expect(fetcher.mock.calls.map(call => call[0])).toEqual(["https://api.example.com/auth/login", "https://api.example.com/user/me"]);
    for (const call of fetcher.mock.calls) expect(call[1]).toMatchObject({ credentials: "include", cache: "no-store", redirect: "error" });
  });
  it("detects rejected cookies after successful login", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({})).mockResolvedValueOnce(json({}, 401));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/login", email: profile.email, password: "test-password" })).toEqual({ ok: false, error: "cookie-unavailable" });
  });
  it("rejects bad credentials without querying the profile", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "private diagnostic" }, 401));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/login", email: profile.email, password: "wrong-password" })).toEqual({ ok: false, error: "invalid-credentials" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
  it("sends a requested MFA code only through authorized login and sanitizes errors", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "MFA_REQUIRED" }, 401));
    const request = { type: "auth/login" as const, email: profile.email, password: "public-fixture-password", code: "123456" };
    expect(isAuthRequest(request)).toBe(true);
    expect(isAuthRequest({ ...request, code: "x".repeat(36) })).toBe(false);
    expect(await createAuthApi("https://api.example.com", fetcher)(request)).toEqual({ ok: false, error: "mfa-required" });
    expect(JSON.parse(fetcher.mock.calls[0]![1]!.body as string).code).toBe("123456");
  });
  it.each([401, 404])("treats HTTP %s as no active account", async status => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, status));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/session" })).toEqual({ ok: true, state: "signed-out" });
  });
  it("rejects expired sessions", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...profile, sessionExpiresAt: new Date(0).toISOString() }));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/session" })).toEqual({ ok: true, state: "signed-out" });
  });
  it("fails closed if verification information is missing", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ ...profile, emailVerified: undefined }));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/session" })).toEqual({ ok: false, error: "invalid-response" });
  });
  it("resolves resend email from the authenticated profile", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ ...profile, emailVerified: false })).mockResolvedValueOnce(json({}));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/resend" })).toEqual({ ok: true, state: "verification-sent" });
    expect(fetcher.mock.calls[1]?.[1]?.body).toBe(JSON.stringify({ email: profile.email }));
  });
  it("does not send mail for missing or verified sessions", async () => {
    for (const response of [json({}, 401), json(profile)]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response);
      await createAuthApi("https://api.example.com", fetcher)({ type: "auth/resend" });
      expect(fetcher).toHaveBeenCalledOnce();
    }
  });
  it.each([[403, "forbidden"], [429, "rate-limited"], [500, "unavailable"]] as const)("sanitizes HTTP %s errors", async (status, error) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({ error: "private server details" }, status));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/logout" })).toEqual({ ok: false, error });
  });
  it("allows logout of an expired session", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, 401));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/logout" })).toEqual({ ok: true, state: "signed-out" });
  });
  it("does not expose invalid response bodies", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response("not JSON", { headers: { "content-type": "application/json" } }));
    expect(await createAuthApi("https://api.example.com", fetcher)({ type: "auth/session" })).toEqual({ ok: false, error: "invalid-response" });
  });
});

describe("authentication message authorization", () => {
  it.each(["auth/login", "auth/logout", "auth/session", "auth/resend"])("denies %s from content scripts", async type => {
    const auth = vi.fn();
    expect(await handleMessage({ type, email: profile.email, password: "test-password" }, { id: "trusted", url: "https://evil.example" }, "trusted", "chrome-extension://trusted/popup.html", vi.fn(), auth)).toEqual({ ok: false, error: "forbidden" });
    expect(auth).not.toHaveBeenCalled();
  });
  it.each([null, { type: "auth/login", email: profile.email, password: "short" }, { type: "auth/logout", url: "https://evil.example" }, { type: "auth/resend", email: "arbitrary@example.com" }])("rejects malformed auth requests", value => {
    expect(isAuthRequest(value)).toBe(false);
  });
  it("rejects sensitive extra response fields", () => {
    expect(isAuthResult({ ok: true, state: "signed-in", profile: { ...profile, token: "secret" } })).toBe(false);
  });
});

describe("backend origin and cookie policy", () => {
  it("uses only the web and stable extension origins in development", () => {
    expect(securityConfig({}).allowedOrigins).toEqual(["http://localhost:3000", DEVELOPMENT_EXTENSION_ORIGIN]);
    expect(securityConfig({}).secureCookies).toBe(false);
  });
  it("requires HTTPS configuration in production", () => {
    expect(() => securityConfig({ NODE_ENV: "production" })).toThrow();
    expect(() => securityConfig({ NODE_ENV: "production", WEB_ORIGIN: "http://localhost:3000" })).toThrow();
    const config = securityConfig({ NODE_ENV: "production", WEB_ORIGIN: "https://vault.example.com", EXTENSION_ORIGINS: DEVELOPMENT_EXTENSION_ORIGIN });
    expect(config.secureCookies).toBe(true);
    expect(config.allowedOrigins).toEqual(["https://vault.example.com", DEVELOPMENT_EXTENSION_ORIGIN]);
  });
  it("rejects wildcard extension allowlists", () => {
    expect(() => securityConfig({ EXTENSION_ORIGINS: "chrome-extension://*" })).toThrow();
  });
  it("blocks missing/null/untrusted origins before mutations run", async () => {
    const route = vi.fn();
    const app = new Hono();
    app.use("*", trustedOrigin(["http://localhost:3000", DEVELOPMENT_EXTENSION_ORIGIN]));
    app.post("/auth/logout", c => { route(); return c.json({ ok: true }); });
    for (const origin of [undefined, "null", "https://evil.example", `${DEVELOPMENT_EXTENSION_ORIGIN}.evil`]) {
      expect((await app.request("/auth/logout", { method: "POST", ...(origin ? { headers: { Origin: origin } } : {}) })).status).toBe(403);
    }
    expect(route).not.toHaveBeenCalled();
    for (const origin of ["http://localhost:3000", DEVELOPMENT_EXTENSION_ORIGIN]) {
      expect((await app.request("/auth/logout", { method: "POST", headers: { Origin: origin } })).status).toBe(200);
    }
    expect(route).toHaveBeenCalledTimes(2);
  });
});
