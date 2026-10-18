import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { MemoryRateLimiter, clientIp, rateLimits } from "../src/middleware/rateLimit.js";
import { trustedOrigin } from "../src/middleware/trustedOrigin.js";
import { requestBody } from "../src/middleware/requestBody.js";
import { PgDialect } from "drizzle-orm/pg-core";
import { serve } from "@hono/node-server";
import { createHash } from "node:crypto";

const mocks = vi.hoisted(() => ({ execute: vi.fn(), select: vi.fn(), where: vi.fn(), update: vi.fn(), insert: vi.fn(), remove: vi.fn(), verify: vi.fn(), session: vi.fn(), email: vi.fn() }));
vi.mock("../src/db/client.js", () => ({ db: { execute: mocks.execute, select: mocks.select, update: mocks.update, insert: mocks.insert, delete: mocks.remove } }));
vi.mock("../src/services/session.js", () => ({ createSession: mocks.session }));
vi.mock("../src/services/email.js", () => ({ sendVerificationEmail: mocks.email }));
vi.mock("argon2", () => ({ default: { verify: mocks.verify, hash: vi.fn().mockResolvedValue("fixture-hash") } }));
import { createApp } from "../src/app.js";
import { securityConfig } from "../src/config/security.js";
import type { DistributedRateLimiter, ProtectionResult } from "../src/services/arcjet.js";
import { arcjetProtection } from "../src/middleware/arcjet.js";
import { sensitiveAccount } from "../src/middleware/sensitiveAccount.js";
import type { Variables } from "../src/types.js";

const origin = "http://localhost:3000";
const user = { id: "00000000-0000-4000-8000-000000000001", name: "Fixture", email: "fixture@example.com", passwordHash: "private-fixture-hash", vaultSalt: "fixture-salt", emailVerified: true };
function rows(values: unknown[]) {
  const query = { from: () => query, where: (predicate: unknown) => { mocks.where(predicate); return query; }, orderBy: () => query, limit: async () => values, then: (resolve: (value: unknown[]) => void) => Promise.resolve(values).then(resolve) }; return query;
}
function post(app: Pick<ReturnType<typeof createApp>, "request">, path: string, body: unknown, headers: Record<string, string> = {}) {
  return app.request(path, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
}
beforeEach(() => { vi.clearAllMocks(); mocks.select.mockReturnValue(rows([])); mocks.verify.mockResolvedValue(false); mocks.remove.mockReturnValue({ where: async () => [] }); });

describe("Arcjet request enforcement", () => {
  function provider(block?: string, result: ProtectionResult = { status: "deny", retryAfter: 42 }) {
    const check = vi.fn<DistributedRateLimiter["check"]>().mockImplementation(async scope => scope === block ? result : { status: "allow" });
    return { check };
  }
  it("denies an IP before parsing its body or reaching persistence, with CORS/security headers", async () => {
    const arcjet = provider("login-ip");
    const response = await post(createApp({ arcjet }), "/auth/login", { email: user.email, password: "private-fixture" });
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("42");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(origin);
    expect(response.headers.get("Access-Control-Expose-Headers")).toContain("Retry-After");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(arcjet.check.mock.calls.map(call => call[0])).toEqual(["general", "login-ip"]);
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("applies normalized email quotas independently of IP, before expensive login work", async () => {
    const arcjet = provider("login-account"); const app = createApp({ arcjet });
    for (const peer of ["198.51.100.1", "198.51.100.2"]) {
      const response = await app.request("/auth/login?token=private-url-token", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", Cookie: "session=private-cookie" }, body: JSON.stringify({ email: " Fixture@Example.com ", password: "private-login-password", code: "123456" }) }, { incoming: { socket: { remoteAddress: peer } } });
      expect(response.status).toBe(429);
    }
    const accounts = arcjet.check.mock.calls.filter(call => call[0] === "login-account");
    expect(accounts.map(call => call[1])).toEqual([user.email, user.email]);
    expect(JSON.stringify(arcjet.check.mock.calls)).not.toContain("private-");
    expect(mocks.select).not.toHaveBeenCalled(); expect(mocks.verify).not.toHaveBeenCalled();
  });
  it("fails closed on provider errors, including authenticated vault reads", async () => {
    const arcjet = provider("general", { status: "error" });
    const response = await createApp({ arcjet }).request("/vault", { headers: { Cookie: "session=public-fixture" } });
    expect(response.status).toBe(503); expect(response.headers.get("Retry-After")).toBe("5");
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("keeps logout independent of general quotas and available during provider failure", async () => {
    const arcjet = provider("logout-ip", { status: "error" }); const app = createApp({ arcjet });
    for (let i = 0; i < 600; i++) await app.request("/user/me");
    expect((await app.request("/user/me")).status).toBe(429);
    arcjet.check.mockClear();
    const response = await post(app, "/auth/logout", {});
    expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(arcjet.check.mock.calls.map(call => call[0])).toEqual(["logout-ip"]);
  });
  it("still enforces the dedicated distributed logout quota", async () => {
    const response = await post(createApp({ arcjet: provider("logout-ip") }), "/auth/logout", {});
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("42");
  });
  it("skips preflight and rejects CSRF before contacting Arcjet", async () => {
    const arcjet = provider(); const app = createApp({ arcjet });
    expect((await app.request("/auth/login", { method: "OPTIONS", headers: { Origin: origin, "Access-Control-Request-Method": "POST" } })).status).toBe(204);
    expect((await post(app, "/auth/login", {}, { Origin: "https://evil.example" })).status).toBe(403);
    expect(arcjet.check).not.toHaveBeenCalled();
  });
  it("passes socket identities, ignoring forged IP headers unless the peer is trusted", async () => {
    const arcjet = provider();
    for (const trustedProxies of [[], ["192.0.2.10"]]) {
      await createApp({ arcjet, trustedProxies }).request("/user/me", { headers: { "X-Forwarded-For": "198.51.100.8", "X-Arcjet-IP": "198.51.100.99", "CF-Connecting-IP": "198.51.100.99" } }, { incoming: { socket: { remoteAddress: "192.0.2.10" } } });
    }
    expect(arcjet.check.mock.calls.map(call => call[1])).toEqual(["192.0.2.10", "198.51.100.8"]);
  });
  it("does not send malformed or oversized bodies to distributed email checks", async () => {
    const arcjet = provider(); const app = createApp({ arcjet });
    for (const [body, status] of [["{", 400], [JSON.stringify({ password: "x".repeat(17_000) }), 413]] as const) {
      expect((await app.request("/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body })).status).toBe(status);
    }
    expect(arcjet.check.mock.calls.some(call => call[0].endsWith("account"))).toBe(false);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("checks the authenticated reauthentication budget without using client-supplied account IDs", async () => {
    const arcjet = provider("reauth-account");
    const app = new Hono<{ Variables: Variables }>();
    app.use("*", arcjetProtection(arcjet, () => "198.51.100.1", "ip"));
    app.use("*", async (c, next) => { c.set("userId", "authenticated-public-fixture-user"); await next(); });
    app.use("*", sensitiveAccount);
    const work = vi.fn(); app.post("/security/fixture", c => { work(); return c.json({ ok: true }); });
    const response = await post(app, "/security/fixture", { userId: "attacker-selected-user" });
    expect(response.status).toBe(429);
    expect(arcjet.check).toHaveBeenLastCalledWith("reauth-account", "authenticated-public-fixture-user", { max: 10, windowMs: 900_000 });
    expect(work).not.toHaveBeenCalled();
  });
});

describe("rate limiting security attacks", () => {
  it("enforces account throttling through real loopback HTTP and the actual Node adapter", async () => {
    const app = createApp();
    const server = serve({ fetch: app.fetch, hostname: "127.0.0.1", port: 0 });
    await new Promise<void>(resolve => server.on("listening", () => resolve()));
    try {
      const address = server.address(); if (!address || typeof address === "string") throw new Error("Fixture unavailable");
      const target = `http://127.0.0.1:${address.port}/auth/login`;
      for (let i = 0; i < 11; i++) {
        const response = await fetch(target, { method: "POST", headers: { Origin: origin, "Content-Type": "application/json", "X-Forwarded-For": `192.0.2.${i}` }, body: JSON.stringify({ email: "loopback@example.com", password: "wrong-public-password" }) });
        expect(response.status).toBe(i < 10 ? 401 : 429); await response.text();
      }
    } finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
  });
  it("stops a concurrent account brute-force burst before password verification", async () => {
    const app = createApp(); mocks.select.mockReturnValue(rows([user]));
    const results = await Promise.all(Array.from({ length: 11 }, () => post(app, "/auth/login", { email: user.email, password: "wrong-fixture-password" })));
    expect(results.filter(r => r.status === 401)).toHaveLength(2); expect(results.filter(r => r.status === 503)).toHaveLength(8); expect(results.filter(r => r.status === 429)).toHaveLength(1);
    expect(mocks.verify).toHaveBeenCalledTimes(2); expect(mocks.session).not.toHaveBeenCalled();
    expect(results.find(r => r.status === 429)?.headers.get("Retry-After")).toBe("900");
  });
  it("rejects IP header spoofing and password spraying across accounts", async () => {
    const app = createApp();
    for (let i = 0; i < 60; i++) expect((await post(app, "/auth/login", { email: `fixture${i}@example.com`, password: "wrong-public-password" }, { "X-Forwarded-For": `192.0.2.${i + 1}` })).status).toBe(401);
    expect((await post(app, "/auth/login", { email: "next@example.com", password: "wrong-public-password" })).status).toBe(429);
    expect(mocks.select).toHaveBeenCalledTimes(60);
  });
  it("uses independent account limits across different connection IPs", async () => {
    const app = new Hono(); app.use("*", requestBody); app.use("*", rateLimits(new MemoryRateLimiter(), c => c.req.header("test-only-ip")!)); app.post("/auth/login", c => c.json({}, 401));
    for (let i = 0; i < 11; i++) {
      const response = await app.request("/auth/login", { method: "POST", headers: { "test-only-ip": `192.0.2.${i}`, "Content-Type": "application/json" }, body: JSON.stringify({ email: i % 2 ? "FIXTURE@example.com" : "fixture@example.com" }) });
      expect(response.status).toBe(i < 10 ? 401 : 429);
    }
  });
  it("cannot evict a blocked victim with new identities and recovers at expiry", () => {
    let time = 100_000; const limiter = new MemoryRateLimiter(() => time, 2); const policy = { max: 1, windowMs: 60_000 };
    expect(limiter.consume("login", "victim", policy).allowed).toBe(true);
    limiter.consume("login", "attacker1", policy);
    expect(limiter.consume("login", "attacker2", policy).allowed).toBe(false);
    expect(limiter.consume("login", "victim", policy).allowed).toBe(false);
    time += 60_000; expect(limiter.consume("login", "victim", policy).allowed).toBe(true);
  });
  it("trusts forwarding only from an exact configured proxy and a single valid address", () => {
    const app = new Hono(); app.get("/", c => c.text(clientIp(c, ["127.0.0.1"])));
    return Promise.all([
      ["127.0.0.1", "192.0.2.1", "192.0.2.1"], ["192.0.2.2", "192.0.2.1", "192.0.2.2"], ["127.0.0.1", "192.0.2.1, 192.0.2.2", "127.0.0.1"],
    ].map(async ([peer, forwarded, expected]) => { const response = await app.request("/", { headers: { "X-Forwarded-For": forwarded! } }, { incoming: { socket: { remoteAddress: peer } } }); expect(await response.text()).toBe(expected); }));
  });
  it("keeps logout possible when the general quota is exhausted", async () => {
    const app = createApp(); for (let i = 0; i < 601; i++) await app.request("/user/me");
    expect((await app.request("/user/me")).status).toBe(429);
    expect((await post(app, "/auth/logout", {})).status).toBe(200);
  });
  it("limits verification guessing and registration floods without database/email calls", async () => {
    const app = new Hono(); app.use("*", requestBody); app.use("*", rateLimits()); app.post("/auth/verify-email", c => c.json({}, 400)); app.post("/auth/register", c => c.json({}, 400));
    for (let i = 0; i < 21; i++) expect((await post(app, "/auth/verify-email", { token: "invalid" })).status).toBe(i < 20 ? 400 : 429);
    for (let i = 0; i < 6; i++) expect((await post(app, "/auth/register", {})).status).toBe(i < 5 ? 400 : 429);
    expect(mocks.email).not.toHaveBeenCalled();
  });
  it("limits resend abuse by both account and IP before any email delivery", async () => {
    const app = createApp();
    for (let i = 0; i < 3; i++) expect((await post(app, "/auth/resend-verification", { email: "resend@example.com" })).status).toBe(401);
    expect((await post(app, "/auth/resend-verification", { email: "resend@example.com" })).status).toBe(429);
    for (let i = 0; i < 6; i++) expect((await post(app, "/auth/resend-verification", { email: `resend${i}@example.com` })).status).toBe(401);
    expect((await post(app, "/auth/resend-verification", { email: "next@example.com" })).status).toBe(429);
    expect(mocks.email).not.toHaveBeenCalled(); expect(mocks.select).not.toHaveBeenCalled();
  });
});

describe("application security attack probes", () => {
  it("keeps a valid-email SQL quote/comment payload in a bound query parameter", async () => {
    const payload = "x'--@example.com";
    expect((await post(createApp(), "/auth/login", { email: payload, password: "wrong-public-password" })).status).toBe(401);
    const query = new PgDialect().sqlToQuery(mocks.where.mock.calls[0]![0]);
    expect(query.params).toEqual([payload]); expect(query.sql).not.toContain(payload); expect(mocks.session).not.toHaveBeenCalled();
  });
  it("creates fresh 256-bit session tokens and stores only their hashes with expiry", async () => {
    const { createSession } = await vi.importActual<typeof import("../src/services/session.js")>("../src/services/session.js");
    const stored: Array<{ userId: string; sessionTokenHash: string; expiresAt: Date }> = [];
    mocks.insert.mockReturnValue({ values: (row: typeof stored[number]) => { stored.push(row); return { returning: async () => [{ id: "public-session-row" }] }; } });
    const first = await createSession(user.id); const second = await createSession(user.id);
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/); expect(second).not.toBe(first);
    expect(stored[0]?.sessionTokenHash).toBe(createHash("sha256").update(first).digest("hex"));
    expect(stored[0]?.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60_000);
    expect(JSON.stringify(stored)).not.toContain(first);
  });
  it.each([undefined, "null", "https://evil.example", "http://localhost:3000.evil.example"])("blocks CSRF from %s before database access", async attackerOrigin => {
    const response = await createApp().request("/auth/login", { method: "POST", headers: attackerOrigin ? { Origin: attackerOrigin } : {}, body: '{}' });
    expect(response.status).toBe(403); expect(mocks.select).not.toHaveBeenCalled();
  });
  it("does not give attacker origins credentialed CORS access", async () => {
    const response = await createApp().request("/user/me", { headers: { Origin: "https://evil.example" } });
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull(); expect(response.status).toBe(401);
  });
  it("rejects malformed JSON and actual oversized streams even with misleading Content-Length", async () => {
    const app = createApp();
    expect((await app.request("/auth/login", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: '{' })).status).toBe(400);
    expect((await app.request("/auth/login", { method: "POST", headers: { Origin: origin }, body: '{}' })).status).toBe(415);
    expect((await app.request("/auth/register", { method: "POST", headers: { Origin: origin, "Content-Length": "1" }, body: 'x'.repeat(17 * 1024) })).status).toBe(413);
    expect(mocks.insert).not.toHaveBeenCalled();
  });
  it("rejects forged/expired sessions and enforces HttpOnly, SameSite and production Secure", async () => {
    expect((await createApp().request("/user/me", { headers: { Cookie: "session=forged" } })).status).toBe(401);
    mocks.select.mockReturnValue(rows([{ userId: user.id, expiresAt: new Date(0) }]));
    expect((await createApp().request("/user/me", { headers: { Cookie: "session=expired" } })).status).toBe(401);
    mocks.select.mockReturnValue(rows([user])); mocks.verify.mockResolvedValue(true); mocks.session.mockResolvedValue("public-test-session");
    const response = await post(createApp(), "/auth/login", { email: user.email, password: "public-password" });
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly"); expect(response.headers.get("Set-Cookie")).toContain("SameSite=Lax");
    expect(securityConfig({ NODE_ENV: "production", WEB_ORIGIN: "https://vault.example" }).secureCookies).toBe(true);
    expect(await response.text()).not.toContain(user.passwordHash);
  });
  it("adds security/no-cache headers to errors and never logs injected database diagnostics", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {}); mocks.select.mockImplementation(() => { throw new Error("private-password session-token DATABASE_URL"); });
    const response = await createApp().request("/user/me", { headers: { Cookie: "session=public-fixture" } });
    expect(response.status).toBe(500); expect(await response.text()).not.toContain("private-password");
    expect(JSON.stringify(error.mock.calls)).not.toContain("private-password"); expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(response.headers.get("X-Frame-Options")).toBe("DENY");
  });
  it("parameterizes SQL payloads and requires ownership in item updates", async () => {
    const session = { userId: user.id, expiresAt: new Date(Date.now() + 60_000) }; mocks.select.mockReturnValueOnce(rows([session])).mockReturnValueOnce(rows([{ emailVerified: true }]));
    mocks.update.mockReturnValue({ set: () => ({ where: async () => [] }) });
    mocks.execute.mockResolvedValue({ rows: [{ admitted: 1, item: null }] });
    const app = createApp();
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { Origin: origin, Cookie: "session=public-fixture", "Content-Type": "application/json" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA" }) });
    expect(response.status).toBe(404);
    const query = new PgDialect().sqlToQuery(mocks.execute.mock.calls[0]![0]);
    expect(query.params).toContain(user.id); expect(query.sql).not.toContain(user.id);
  });
  it.each([null, [], { email: { $ne: null } }, { email: "not-an-email", password: "short" }, { email: user.email, password: "x".repeat(1025) }])("rejects invalid authentication inputs %j before persistence", async payload => {
    expect((await post(createApp(), "/auth/login", payload)).status).toBe(400); expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rejects malformed resend requests and verification token guessing payloads", async () => {
    for (const payload of [null, {}, { email: { $ne: null } }, { email: "not-an-email" }]) expect((await post(createApp(), "/auth/resend-verification", payload)).status).toBe(401);
    for (const payload of [null, {}, { token: "' OR 1=1 --" }, { token: "x".repeat(5000) }]) expect((await post(createApp(), "/auth/verify-email", payload)).status).toBe(400);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("rejects SQL-injection item IDs and non-ciphertext vault writes", async () => {
    const session = { userId: user.id, expiresAt: new Date(Date.now() + 60_000) };
    mocks.select.mockImplementation(() => rows([{ ...user, ...session }]));
    const app = createApp();
    expect((await app.request("/vault/%27%20OR%201%3D1%20--", { headers: { Cookie: "session=public-fixture" } })).status).toBe(400);
    expect((await post(app, "/vault", { cipherText: "plaintext-secret", nonce: "invalid" }, { Cookie: "session=public-fixture" })).status).toBe(400);
    expect(mocks.insert).not.toHaveBeenCalled(); expect(mocks.update).not.toHaveBeenCalled();
  });
  it("blocks legacy email changes before changing verification or persistence", async () => {
    mocks.select.mockReturnValueOnce(rows([{ userId: user.id, expiresAt: new Date(Date.now() + 60_000) }])).mockReturnValueOnce(rows([user]));
    const set = vi.fn().mockReturnValue({ where: () => ({ returning: async () => [{ ...user, email: "unverified@example.com" }] }) });
    mocks.update.mockReturnValue({ set });
    const response = await createApp().request("/user/me", { method: "PATCH", headers: { Origin: origin, Cookie: "session=public-fixture", "Content-Type": "application/json" }, body: JSON.stringify({ email: "unverified@example.com" }) });
    expect(response.status).toBe(409); expect(set).not.toHaveBeenCalled();
    // A legacy caller cannot bypass the address-confirmation flow.
  });
});
