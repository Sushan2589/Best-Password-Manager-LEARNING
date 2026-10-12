import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";

const mocks = vi.hoisted(() => ({ select: vi.fn(), remove: vi.fn(), verify: vi.fn(), createSession: vi.fn() }));
vi.mock("../../../api/src/db/client.js", () => ({ db: { select: mocks.select, delete: mocks.remove } }));
vi.mock("../../../api/src/services/session.js", () => ({ createSession: mocks.createSession }));
vi.mock("../../../api/src/services/email.js", () => ({ sendVerificationEmail: vi.fn() }));
vi.mock("argon2", () => ({ default: { verify: mocks.verify } }));

vi.mock("../../../api/src/services/mfa.js", () => ({ checkFactor: vi.fn().mockResolvedValue(true), mfaRecord: vi.fn().mockResolvedValue(undefined) }));
import authRoutes from "../../../api/routes/auth";
import userRoutes from "../../../api/routes/user";
import { requireAuth } from "../../../api/src/middleware/requireAuth";
import { requireEmailVerified } from "../../../api/src/middleware/requireEmailVerified";
import type { Variables } from "../../../api/src/types";

const user = { id: "00000000-0000-4000-8000-000000000001", email: "test@example.com", name: "Test", passwordHash: "fixture-hash", vaultSalt: "fixture-salt", emailVerified: true };
const session = { userId: user.id, expiresAt: new Date(Date.now() + 3600000) };
function rows(data: unknown[]) {
  const query = { from: () => query, where: () => query, limit: async () => data, then: (resolve: (value: unknown[]) => void) => Promise.resolve(data).then(resolve) };
  return query;
}
function app() {
  const result = new Hono<{ Variables: Variables }>();
  result.route("/auth", authRoutes);
  result.route("/user", userRoutes);
  result.get("/protected", requireAuth, requireEmailVerified, c => c.json({ ok: true }));
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.remove.mockReturnValue({ where: async () => undefined });
  mocks.createSession.mockResolvedValue("fixture-session");
  mocks.verify.mockResolvedValue(true);
});

describe("actual Hono authentication routes with mocked persistence", () => {
  it("login verifies the stored hash and issues an HttpOnly Lax cookie", async () => {
    mocks.select.mockReturnValueOnce(rows([user]));
    const response = await app().request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: "fixture-password" }) });
    expect(response.status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith(user.passwordHash, "fixture-password");
    expect(mocks.createSession).toHaveBeenCalledWith(user.id, { sessionVersion: 0 });
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Lax");
    expect(await response.json()).not.toHaveProperty("sessionToken");
  });
  it("incorrect password does not create a session", async () => {
    mocks.select.mockReturnValueOnce(rows([user])); mocks.verify.mockResolvedValue(false);
    const response = await app().request("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: user.email, password: "wrong-password" }) });
    expect(response.status).toBe(401); expect(mocks.createSession).not.toHaveBeenCalled();
  });
  it("missing cookie is rejected before database lookup", async () => {
    expect((await app().request("/user/me")).status).toBe(401);
    expect(mocks.select).not.toHaveBeenCalled();
  });
  it("invalid or revoked session is rejected", async () => {
    mocks.select.mockReturnValueOnce(rows([]));
    expect((await app().request("/user/me", { headers: { Cookie: "session=revoked" } })).status).toBe(401);
  });
  it("expired session is rejected", async () => {
    mocks.select.mockReturnValueOnce(rows([{ ...session, expiresAt: new Date(0) }]));
    expect((await app().request("/user/me", { headers: { Cookie: "session=expired" } })).status).toBe(401);
  });
  it("profile contains verification and actual session expiry, never a password hash", async () => {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    mocks.select.mockReturnValueOnce(rows([session])).mockReturnValueOnce(rows([publicUser]));
    const response = await app().request("/user/me", { headers: { Cookie: "session=valid" } });
    expect(await response.json()).toMatchObject({ emailVerified: true, sessionExpiresAt: session.expiresAt.toISOString() });
  });
  it("unverified sessions cannot access verified-only routes", async () => {
    mocks.select.mockReturnValueOnce(rows([session])).mockReturnValueOnce(rows([{ ...user, emailVerified: false }]));
    const response = await app().request("/protected", { headers: { Cookie: "session=valid" } });
    expect(response.status).toBe(403); expect(await response.json()).toEqual({ error: "EMAIL_NOT_VERIFIED" });
  });
  it("logout deletes the session and expires the cookie", async () => {
    const response = await app().request("/auth/logout", { method: "POST", headers: { Cookie: "session=valid" } });
    expect(response.status).toBe(200); expect(mocks.remove).toHaveBeenCalledOnce();
    expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  });
  it("failed revocation still expires the cookie and reports failure", async () => {
    mocks.remove.mockReturnValue({ where: async () => { throw new Error("private database diagnostic"); } });
    const log = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const response = await app().request("/auth/logout", { method: "POST", headers: { Cookie: "session=valid" } });
    expect(response.status).toBe(500); expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
    expect(log.mock.calls.some(call => String(call[0]).includes("session_revocation_failed"))).toBe(true);
    expect(await response.json()).toEqual({ error: "Unable to revoke session" });
  });
});
