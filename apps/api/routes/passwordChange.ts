import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { deleteCookie } from "hono/cookie";
import { db } from "../src/db/client.js";
import { usersTable } from "../src/db/schema.js";
import { requireAuth } from "../src/middleware/requireAuth.js";
import { requireEmailVerified } from "../src/middleware/requireEmailVerified.js";
import { sensitiveAccount } from "../src/middleware/sensitiveAccount.js";
import { verifyPassword, hashPassword, passwordCompromised } from "../src/services/password.js";
import { checkFactor } from "../src/services/mfa.js";
import { commitLoginPassword } from "../src/services/passwordChange.js";
import { sendSecurityNotice } from "../src/services/email.js";
import { securityLog } from "../src/services/securityLog.js";
import { SESSION_COOKIE_OPTIONS } from "../src/config/security.js";
import type { Variables } from "../src/types.js";

const routes = new Hono<{ Variables: Variables }>();
routes.use("/login-password", requireAuth, requireEmailVerified, sensitiveAccount);
const loginSchema = z.object({ password: z.string().min(6).max(1024), newPassword: z.string().max(1024).refine(value => [...value].length >= 15), code: z.string().max(35).optional() }).strict();
routes.post("/login-password", async c => {
  const parsed = loginSchema.safeParse(await c.req.json());
  if (!parsed.success || parsed.data.password === parsed.data.newPassword) return c.json({ error: "Choose a different sign-in password of at least 15 characters" }, 400);
  const actor = { userId: c.get("userId"), sessionId: c.get("sessionId"), sessionVersion: c.get("sessionVersion") };
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, actor.userId)).limit(1);
  if (!user || !await verifyPassword(user.passwordHash, parsed.data.password)) return c.json({ error: "Reauthentication failed" }, 401);
  if (!await checkFactor(user.id, parsed.data.code)) return c.json({ error: "MFA_REQUIRED" }, 401);
  try {
    if (await passwordCompromised(parsed.data.newPassword)) return c.json({ error: "PASSWORD_COMPROMISED" }, 400);
  } catch { return c.json({ error: "Password safety check unavailable. Try again later." }, 503); }
  const newHash = await hashPassword(parsed.data.newPassword);
  if (!await commitLoginPassword(actor, user.passwordHash, newHash)) return c.json({ error: "Session or account changed. Sign in again and retry." }, 409);
  deleteCookie(c, "session", SESSION_COOKIE_OPTIONS);
  void sendSecurityNotice(user.email).catch(() => securityLog("operation_failed"));
  return c.json({ message: "Sign-in password changed. All sessions were signed out. Your vault unlock password is unchanged." });
});
export default routes;
