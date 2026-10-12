import { sensitiveAccount } from "../src/middleware/sensitiveAccount.js";
import { Hono } from "hono";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { usersTable, sessionsTable, emailVerificationTokensTable } from "../src/db/schema.js";
import { requireAuth } from "../src/middleware/requireAuth.js";
import { requireEmailVerified } from "../src/middleware/requireEmailVerified.js";
import { verifyPassword } from "../src/services/password.js";
import { generateVerificationToken, hashVerificationToken } from "../src/utils/emailVerification.js";
import { sendVerificationEmail, sendSecurityNotice } from "../src/services/email.js";
import type { Variables } from "../src/types.js";
import { checkFactor } from "../src/services/mfa.js";

const routes = new Hono<{ Variables: Variables }>();
routes.use("*", requireAuth, requireEmailVerified, sensitiveAccount);
routes.post("/email-change", async c => {
  const parsed = z.object({ email: z.string().email().max(254), password: z.string().min(6).max(1024), code: z.string().max(35).optional() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const userId = c.get("userId");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !await verifyPassword(user.passwordHash, parsed.data.password)) return c.json({ error: "Reauthentication failed" }, 401);
  if (!await checkFactor(user.id, parsed.data.code, c.get("mfaVerifiedAt"))) return c.json({ error: "MFA_REQUIRED" }, 401);
  const target = parsed.data.email.toLowerCase();
  const [occupied] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, target)).limit(1);
  if (!occupied && target !== user.email) {
    const raw = generateVerificationToken();
    await db.batch([
      db.update(usersTable).set({ pendingEmail: target }).where(eq(usersTable.id, userId)),
      db.delete(emailVerificationTokensTable).where(and(eq(emailVerificationTokensTable.userId, userId), eq(emailVerificationTokensTable.purpose, "change"))),
      db.insert(emailVerificationTokensTable).values({ userId, targetEmail: target, purpose: "change", tokenHash: hashVerificationToken(raw), expiresAt: new Date(Date.now() + 30 * 60_000) }),
    ]);
    await sendVerificationEmail(target, raw);
    await sendSecurityNotice(user.email).catch(() => console.error("Security notification delivery failed."));
  }
  return c.json({ message: "If the address can be used, a confirmation email has been sent. Your current address remains active until confirmed." }, 202);
});
routes.get("/sessions", async c => {
  const rows = await db.select({ id: sessionsTable.id, createdAt: sessionsTable.createdAt, lastUsedAt: sessionsTable.lastUsedAt, expiresAt: sessionsTable.expiresAt }).from(sessionsTable).where(eq(sessionsTable.userId, c.get("userId")));
  return c.json(rows.map(row => ({ ...row, current: row.id === c.get("sessionId") })));
});
routes.post("/sessions/revoke", async c => {
  const parsed = z.object({ id: z.string().uuid(), password: z.string().min(6).max(1024), code: z.string().max(35).optional() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.get("userId"))).limit(1);
  if (!user || !await verifyPassword(user.passwordHash, parsed.data.password)) return c.json({ error: "Reauthentication failed" }, 401);
  if (!await checkFactor(user.id, parsed.data.code, c.get("mfaVerifiedAt"))) return c.json({ error: "MFA_REQUIRED" }, 401);
  await db.delete(sessionsTable).where(and(eq(sessionsTable.userId, user.id), eq(sessionsTable.id, parsed.data.id)));
  if (parsed.data.id === c.get("sessionId")) {
    const { deleteCookie } = await import("hono/cookie");
    const { SESSION_COOKIE_OPTIONS } = await import("../src/config/security.js");
    deleteCookie(c, "session", SESSION_COOKIE_OPTIONS);
  }
  return c.json({ ok: true });
});
export default routes;
