import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readFile } from "node:fs/promises";
import { hashVerificationToken } from "../src/utils/emailVerification.js";
import { usersTable, sessionsTable, emailVerificationTokensTable, mfaTable, recoveryCodesTable } from "../src/db/schema.js";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { createHash } from "node:crypto";
import { requireAuth } from "../src/middleware/requireAuth.js";
import type { Variables } from "../src/types.js";

const fixture = vi.hoisted(() => ({ db: undefined as unknown }));
vi.mock("../src/db/client.js", () => ({ get db() { return fixture.db; } }));
import { consumeVerification } from "../src/services/verification.js";
import { base32, totp, prepareMfa, enableMfa, checkFactor } from "../src/services/mfa.js";

const pg = new PGlite();
const db = drizzle({ client: pg });
const owner = "00000000-0000-4000-8000-000000000001";
const token = "a".repeat(64);
beforeAll(async () => {
  fixture.db = db;
  process.env.MFA_ENCRYPTION_KEY = "01".repeat(32); // Public fixture, never used outside tests.
  await pg.exec("SET TIME ZONE 'UTC'");
  await pg.exec(`CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name varchar(255) NOT NULL,email text NOT NULL UNIQUE,password_hash varchar(255) NOT NULL,vault_salt text NOT NULL,email_verified boolean NOT NULL DEFAULT false,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE sessions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,session_token_hash text NOT NULL UNIQUE,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE vault_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,cipher_text text NOT NULL,nonce text NOT NULL,created_at timestamp NOT NULL DEFAULT now(),updated_at timestamp NOT NULL DEFAULT now());
    CREATE TABLE email_verification_tokens(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id uuid REFERENCES users(id) ON DELETE CASCADE,token_hash text NOT NULL UNIQUE,expires_at timestamp NOT NULL,created_at timestamp NOT NULL DEFAULT now());`);
  await pg.exec(await readFile(new URL("../migrations/20261012_security.sql", import.meta.url), "utf8"));
}, 30000);
afterAll(async () => { await pg.close(); delete process.env.MFA_ENCRYPTION_KEY; });
beforeEach(async () => {
  await pg.exec("TRUNCATE users CASCADE");
  await db.insert(usersTable).values({ id: owner, name: "Fixture", email: "old@example.com", passwordHash: "fixture-only", vaultSalt: "fixture-only" });
});
async function addToken(targetEmail = "old@example.com", purpose = "verify", expiresAt = new Date(Date.now() + 60000)) {
  await db.insert(emailVerificationTokensTable).values({ userId: owner, tokenHash: hashVerificationToken(token), targetEmail, purpose, expiresAt });
}
async function session() { await db.insert(sessionsTable).values({ userId: owner, sessionTokenHash: "fixture-hash", expiresAt: new Date(Date.now() + 3600000) }); }
describe("security statements against PostgreSQL", () => {
  it("migrates an existing schema and consumes verification only once", async () => {
    await addToken();
    const results = await Promise.all([consumeVerification(token), consumeVerification(token)]);
    expect(results.filter(Boolean)).toHaveLength(1);
    expect((await db.select().from(usersTable))[0]!.emailVerified).toBe(true);
  });
  it("rejects expired tokens and tokens bound to another address", async () => {
    await addToken("other@example.com");
    expect(await consumeVerification(token)).toBeUndefined();
    await db.delete(emailVerificationTokensTable);
    await addToken("old@example.com", "verify", new Date(Date.now() - 60000));
    expect(await consumeVerification(token)).toBeUndefined();
    expect((await db.select().from(usersTable))[0]!.emailVerified).toBe(false);
  });
  it("confirms pending email, revokes sessions and increments the revocation version atomically", async () => {
    await db.update(usersTable).set({ pendingEmail: "new@example.com" }).where(eq(usersTable.id, owner));
    await session(); await addToken("new@example.com", "change");
    expect(await consumeVerification(token)).toEqual({ id: owner, purpose: "change" });
    const user = (await db.select().from(usersTable))[0]!;
    expect(user.email).toBe("new@example.com"); expect(user.pendingEmail).toBeNull(); expect(user.sessionVersion).toBe(1);
    expect(await db.select().from(sessionsTable)).toHaveLength(0);
  });
  it("rejects a superseded email-change link", async () => {
    await db.update(usersTable).set({ pendingEmail: "latest@example.com" }).where(eq(usersTable.id, owner));
    await addToken("superseded@example.com", "change");
    expect(await consumeVerification(token)).toBeUndefined();
    expect((await db.select().from(usersTable))[0]!.email).toBe("old@example.com");
  });
  it("rejects idle, expired and superseded sessions using real session predicates", async () => {
    const app = new Hono<{ Variables: Variables }>(); app.get("/", requireAuth, c => c.json({ id: c.get("userId") }));
    const cookie = "public-session-fixture";
    await db.insert(sessionsTable).values({ userId: owner, sessionTokenHash: createHash("sha256").update(cookie).digest("hex"), expiresAt: new Date(Date.now()+3600000) });
    const request = () => app.request("/", { headers: { Cookie: `session=${cookie}` } });
    expect((await request()).status).toBe(200);
    await db.update(sessionsTable).set({ lastUsedAt: new Date(Date.now()-31*60000) });
    expect((await request()).status).toBe(401);
    await db.update(sessionsTable).set({ lastUsedAt: new Date(), expiresAt: new Date(Date.now()-1000) });
    expect((await request()).status).toBe(401);
    await db.update(sessionsTable).set({ expiresAt: new Date(Date.now()+3600000) });
    await db.update(usersTable).set({ sessionVersion: 1 });
    expect((await request()).status).toBe(401);
  });
  it("matches the RFC 4226/6238 six-digit public test vector", () => {
    expect(totp(base32(new TextEncoder().encode("12345678901234567890")), 1)).toBe("287082");
  });
  it("encrypts MFA secrets, activates once, revokes sessions and prevents proof replay", async () => {
    const secret = await prepareMfa(owner); await session();
    const pending = (await db.select().from(mfaTable))[0]!;
    expect(pending.cipherText).not.toContain(secret); expect(pending.enabled).toBe(false);
    const step = Math.floor(Date.now() / 30000);
    expect(await enableMfa(owner, "bad-code")).toBeNull();
    const codes = await enableMfa(owner, totp(secret, step));
    expect(codes).toHaveLength(8);
    expect(await enableMfa(owner, totp(secret, step))).toBeNull();
    expect(await db.select().from(sessionsTable)).toHaveLength(0);
    expect((await db.select().from(usersTable))[0]!.sessionVersion).toBe(1);
    expect(await checkFactor(owner, totp(secret, step))).toBe(false);
    expect(await checkFactor(owner, totp(secret, step + 1))).toBe(true);
    expect(await checkFactor(owner, totp(secret, step + 1))).toBe(false);
    expect(await checkFactor(owner)).toBe(false);
    await expect(prepareMfa(owner)).rejects.toThrow("MFA_ALREADY_ENABLED");
    const stored = await db.select().from(recoveryCodesTable);
    expect(stored).toHaveLength(8); expect(stored[0]!.codeHash).not.toBe(codes![0]);
    const attempts = await Promise.all([checkFactor(owner, codes![0]!), checkFactor(owner, codes![0]!)]);
    expect(attempts.filter(Boolean)).toHaveLength(1);
    expect(await db.select().from(recoveryCodesTable)).toHaveLength(7);
  });
});
