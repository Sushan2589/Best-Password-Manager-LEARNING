import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { usersTable, sessionsTable, vaultItemsTable, emailVerificationTokensTable } from "../src/db/schema.js";
const mock = vi.hoisted(() => ({ db: undefined as unknown, notice: vi.fn(), compromised: vi.fn(), hash: vi.fn() }));
vi.mock("../src/db/client.js", () => ({ get db() { return mock.db; } }));
vi.mock("../src/services/email.js", () => ({ sendSecurityNotice: mock.notice, sendVerificationEmail: vi.fn() }));
vi.mock("../src/services/password.js", () => ({ verifyPassword: async (hash: string, password: string) => hash === "fixture-hash" && password === "public old account password", hashPassword: mock.hash, passwordCompromised: mock.compromised }));
import { createApp } from "../src/app.js";
import { commitLoginPassword } from "../src/services/passwordChange.js";
import { prepareMfa, enableMfa, totp } from "../src/services/mfa.js";
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
import { emailConfig } from "../src/config/email.js";
const pg = new PGlite(); const db = drizzle({ client: pg }); let owner: string; let counter = 0;
const sessionId = "00000000-0000-4000-8000-000000000010";
const actor = () => ({ userId: owner, sessionId, sessionVersion: 0 });
const password = "public old account password"; const newPassword = "public new account password";
beforeAll(async () => {
  mock.db = db; process.env.MFA_ENCRYPTION_KEY = "01".repeat(32); await pg.exec("SET TIME ZONE 'UTC'");
  await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(255) NOT NULL,email text NOT NULL UNIQUE,password_hash varchar(255) NOT NULL,vault_salt text NOT NULL,email_verified boolean NOT NULL DEFAULT false,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,session_token_hash text NOT NULL UNIQUE,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE vault_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,cipher_text text NOT NULL,nonce text NOT NULL,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE email_verification_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now());`);

  for (const name of ["20261012_security.sql", "20261017_vault_password_rotation.sql"]) await pg.exec(await readFile(new URL(`../migrations/${name}`, import.meta.url), "utf8"));
}, 60000);
afterAll(async () => { await pg.close(); delete process.env.MFA_ENCRYPTION_KEY; });
beforeEach(async () => {
  mock.notice.mockReset().mockResolvedValue(undefined); mock.compromised.mockReset().mockResolvedValue(false); mock.hash.mockReset().mockResolvedValue("new-argon-fixture-hash");
  owner = `00000000-0000-4000-8000-${String(++counter).padStart(12,"0")}`;
  await pg.exec("TRUNCATE users CASCADE");
  await db.insert(usersTable).values({ id: owner, name: "Fixture", email: "fixture@example.com", emailVerified: true, passwordHash: "fixture-hash", vaultSalt: btoa("0123456789abcdef") });
  await db.insert(sessionsTable).values({ id: sessionId, userId: owner, sessionTokenHash: digest("public-session"), expiresAt: new Date(Date.now()+3600000), lastUsedAt: new Date() });
  await db.insert(vaultItemsTable).values({ userId: owner, cipherText: "public-encrypted-fixture", nonce: "AAAAAAAAAAAAAAAA" });
});
function post(path: string, body: unknown, origin = "http://localhost:3000") {
  return createApp().request(path, { method: "POST", headers: { Origin: origin, Cookie: "session=public-session", "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
it("requires current-password reauthentication and verified registration email, without an email code", async () => {
  expect((await post("/security/login-password", { password: "wrong-password", newPassword })).status).toBe(401);
  expect(mock.hash).not.toHaveBeenCalled();
  await db.update(usersTable).set({ emailVerified: false });
  expect((await post("/security/login-password", { password, newPassword })).status).toBe(403);
  expect(mock.notice).not.toHaveBeenCalled();
});
it("changes only the login hash, cancels pending email changes and revokes every session atomically", async () => {
  await db.update(usersTable).set({ pendingEmail: "pending@example.com" });
  await db.insert(emailVerificationTokensTable).values([
    { userId: owner, targetEmail: "pending@example.com", purpose: "change", tokenHash: "public-change-fixture", expiresAt: new Date(Date.now()+60000) },
    { userId: owner, targetEmail: "fixture@example.com", purpose: "verify", tokenHash: "public-verification-fixture", expiresAt: new Date(Date.now()+60000) },
  ]);
  await db.insert(sessionsTable).values({ userId: owner, sessionTokenHash: "other-session-fixture", expiresAt: new Date(Date.now()+3600000) });
  const before = (await db.select().from(usersTable))[0]!; const vault = await db.select().from(vaultItemsTable);
  const response = await post("/security/login-password", { password, newPassword });
  expect(response.status).toBe(200); expect(response.headers.get("Set-Cookie")).toContain("Max-Age=0");
  const user = (await db.select().from(usersTable))[0]!;
  expect(user.passwordHash).toBe("new-argon-fixture-hash"); expect(user.sessionVersion).toBe(1); expect(user.pendingEmail).toBeNull();
  expect((await db.select().from(emailVerificationTokensTable)).map(row => row.purpose)).toEqual(["verify"]);
  expect(user.vaultSalt).toBe(before.vaultSalt); expect(user.vaultRevision).toBe(before.vaultRevision); expect(user.vaultKeyVersion).toBe(0);
  expect(await db.select().from(vaultItemsTable)).toEqual(vault); expect(await db.select().from(sessionsTable)).toEqual([]);
  expect(mock.notice).toHaveBeenCalledWith("fixture@example.com");
  expect((await post("/security/login-password", { password, newPassword })).status).toBe(401);
});
it("requires fresh MFA even after recent MFA login and never accepts a reused recovery code", async () => {
  const secret = await prepareMfa(owner); const codes = await enableMfa(owner, totp(secret, Math.floor(Date.now()/30000)));
  expect(codes).toHaveLength(8);
  await db.insert(sessionsTable).values({ id: sessionId, userId: owner, sessionVersion: 1, sessionTokenHash: digest("public-session"), expiresAt: new Date(Date.now()+3600000), lastUsedAt: new Date(), mfaVerifiedAt: new Date() });
  expect((await post("/security/login-password", { password, newPassword })).status).toBe(401);
  expect((await post("/security/login-password", { password, newPassword, code: "bad" })).status).toBe(401);
  expect((await db.select().from(usersTable))[0]!.passwordHash).toBe("fixture-hash");
  expect((await post("/security/login-password", { password, newPassword, code: codes![0] })).status).toBe(200);
  await db.update(usersTable).set({ passwordHash: "fixture-hash" }); // Test another legitimate attempt with the consumed proof.
  await db.insert(sessionsTable).values({ id: sessionId, userId: owner, sessionVersion: 2, sessionTokenHash: digest("public-session"), expiresAt: new Date(Date.now()+3600000), lastUsedAt: new Date() });
  expect((await post("/security/login-password", { password, newPassword, code: codes![0] })).status).toBe(401);
});
it("rejects weak, identical, malformed and obsolete email-proof payloads", async () => {
  for (const body of [{ password, newPassword: "short" }, { password, newPassword: password }, { password, newPassword, code: "x".repeat(36) },
    { password, newPassword, emailProof: { challenge: "a".repeat(64), code: "12345678" } }]) {
    expect((await post("/security/login-password", body)).status).toBe(400);
  }
  expect(mock.hash).not.toHaveBeenCalled();
  expect((await post("/security/password-change/email-code", { purpose: "login", password })).status).toBe(404);
});
it("fails closed on compromised passwords and password-safety service outages", async () => {
  mock.compromised.mockResolvedValueOnce(true);
  expect((await post("/security/login-password", { password, newPassword })).status).toBe(400);
  mock.compromised.mockRejectedValueOnce(new Error("public fixture outage"));
  expect((await post("/security/login-password", { password, newPassword })).status).toBe(503);
  expect((await db.select().from(usersTable))[0]!.passwordHash).toBe("fixture-hash"); expect(mock.hash).not.toHaveBeenCalled();
});
it("keeps successful password changes independent of notification delivery", async () => {
  mock.notice.mockRejectedValueOnce(new Error("public notification fixture outage"));
  expect((await post("/security/login-password", { password, newPassword })).status).toBe(200);
  expect((await db.select().from(usersTable))[0]!.passwordHash).toBe("new-argon-fixture-hash");
  expect(await db.select().from(sessionsTable)).toEqual([]);
});
it("rechecks the current hash, verified status, account/session versions and expiry at commit", async () => {
  for (const current of ["old-hash", "fixture-hash"]) {
    if (current === "fixture-hash") await db.update(usersTable).set({ emailVerified: false });
    expect(await commitLoginPassword(actor(), current, "must-not-save")).toBeUndefined();
  }
  await db.update(usersTable).set({ emailVerified: true });
  expect(await commitLoginPassword({ ...actor(), sessionVersion: 1 }, "fixture-hash", "must-not-save")).toBeUndefined();
  expect(await commitLoginPassword({ ...actor(), sessionId: "00000000-0000-4000-8000-000000000099" }, "fixture-hash", "must-not-save")).toBeUndefined();
  await db.update(sessionsTable).set({ expiresAt: new Date(Date.now()-1000) });
  expect(await commitLoginPassword(actor(), "fixture-hash", "must-not-save")).toBeUndefined();
  await db.update(sessionsTable).set({ expiresAt: new Date(Date.now()+3600000), lastUsedAt: new Date(Date.now()-31*60000) });
  expect(await commitLoginPassword(actor(), "fixture-hash", "must-not-save")).toBeUndefined();
  expect((await db.select().from(usersTable))[0]!.passwordHash).toBe("fixture-hash");
});
it("rolls back password and session changes when revocation fails", async () => {
  await pg.exec(`CREATE FUNCTION deny_session_delete() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'public rollback fixture'; END $$; CREATE TRIGGER deny_delete BEFORE DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION deny_session_delete();`);
  try { await expect(commitLoginPassword(actor(), "fixture-hash", "new-hash")).rejects.toThrow(); }
  finally { await pg.exec("DROP TRIGGER deny_delete ON sessions; DROP FUNCTION deny_session_delete()"); }
  expect((await db.select().from(usersTable))[0]!.passwordHash).toBe("fixture-hash"); expect(await db.select().from(sessionsTable)).toHaveLength(1);
});
it("blocks CSRF and retains account-based brute-force protection", async () => {
  expect((await post("/security/login-password", { password, newPassword }, "https://evil.example")).status).toBe(403);
  for (let index=0;index<10;index++) expect((await post("/security/login-password", { password: "wrong-password", newPassword })).status).toBe(401);
  const limited = await post("/security/login-password", { password, newPassword });
  expect(limited.status).toBe(429); expect(limited.headers.get("Retry-After")).toBeTruthy();
  expect(mock.hash).not.toHaveBeenCalled();
});
it("requires a verified production sender and keeps the test sender development-only", () => {
  expect(emailConfig({ NODE_ENV: "development" }).from).toBe("onboarding@resend.dev");
  expect(() => emailConfig({ NODE_ENV: "production", RESEND_API_KEY: "public-fixture" })).toThrow();
  expect(() => emailConfig({ NODE_ENV: "production", RESEND_API_KEY: "public-fixture", EMAIL_FROM: "onboarding@resend.dev" })).toThrow();
  expect(emailConfig({ NODE_ENV: "production", RESEND_API_KEY: "public-fixture", EMAIL_FROM: "security@mail.example.com" }).from).toBe("security@mail.example.com");
});
