import { sensitiveAccount } from "../src/middleware/sensitiveAccount.js";
import { Hono } from "hono";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client.js";
import { usersTable } from "../src/db/schema.js";
import { requireAuth } from "../src/middleware/requireAuth.js";
import { requireEmailVerified } from "../src/middleware/requireEmailVerified.js";
import { verifyPassword } from "../src/services/password.js";
import { prepareMfa, enableMfa, mfaRecord, checkFactor } from "../src/services/mfa.js";
import { deleteCookie } from "hono/cookie";
import { SESSION_COOKIE_OPTIONS } from "../src/config/security.js";
import type { Variables } from "../src/types.js";
import { sendSecurityNotice } from "../src/services/email.js";
const routes = new Hono<{ Variables: Variables }>();
routes.use("*", requireAuth, requireEmailVerified, sensitiveAccount);
routes.get("/status", async c => c.json({ enabled: (await mfaRecord(c.get("userId")))?.enabled === true }));
routes.post("/setup", async c => {
  const parsed = z.object({ password: z.string().min(6).max(1024) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.get("userId"))).limit(1);
  if (!user || !await verifyPassword(user.passwordHash, parsed.data.password)) return c.json({ error: "Reauthentication failed" }, 401);
  try {
    const secret = await prepareMfa(user.id);
    return c.json({ secret, uri: `otpauth://totp/Password%20Manager:${encodeURIComponent(user.email)}?secret=${secret}&issuer=Password%20Manager&algorithm=SHA1&digits=6&period=30` });
  } catch { return c.json({ error: "MFA setup unavailable. Check configuration or existing enrollment." }, 409); }
});
routes.post("/enable", async c => {
  const parsed = z.object({ password: z.string().min(6).max(1024), code: z.string().regex(/^\d{6}$/) }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, c.get("userId"))).limit(1);
  if (!user || !await verifyPassword(user.passwordHash, parsed.data.password)) return c.json({ error: "Reauthentication failed" }, 401);
  const recoveryCodes = await enableMfa(user.id, parsed.data.code);
  if (!recoveryCodes) return c.json({ error: "Invalid or expired setup code" }, 400);
  deleteCookie(c, "session", SESSION_COOKIE_OPTIONS);
  await sendSecurityNotice(user.email).catch(() => console.error("Security notification delivery failed."));
  return c.json({ recoveryCodes });
});
export default routes;
routes.post("/disable", async c => {
  const parsed = z.object({ password: z.string().min(6).max(1024), code: z.string().max(35).optional() }).safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const userId = c.get("userId"); const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !await verifyPassword(user.passwordHash, parsed.data.password) || !await checkFactor(userId, parsed.data.code, c.get("mfaVerifiedAt"))) return c.json({ error: "Reauthentication failed" }, 401);
  await db.execute(sql`WITH removed AS (DELETE FROM account_mfa WHERE user_id=${userId} RETURNING user_id),
    version AS (UPDATE users SET session_version=session_version+1 WHERE id IN(SELECT user_id FROM removed)),
    recovery AS (DELETE FROM mfa_recovery_codes WHERE user_id IN(SELECT user_id FROM removed)),
    revoked AS (DELETE FROM sessions WHERE user_id IN(SELECT user_id FROM removed)) SELECT user_id FROM removed`);
  deleteCookie(c, "session", SESSION_COOKIE_OPTIONS);
  await sendSecurityNotice(user.email).catch(() => console.error("Security notification delivery failed."));
  return c.json({ message: "MFA disabled. Sign in again." });
});
