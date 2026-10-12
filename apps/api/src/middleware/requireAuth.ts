import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import crypto from "node:crypto";
import { sessionsTable, usersTable } from "../db/schema.js";
import { db } from "../db/client.js";
import { eq, and, sql } from "drizzle-orm";
import type { Variables } from "../types.js";
import { revocations } from "../services/revocations.js";

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const sessionToken = getCookie(c, "session");

  if (!sessionToken || sessionToken.length > 1024) {
    return c.json({ error: "Missing session token" }, 401);
  }

  const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");
  if (revocations.denied(sessionTokenHash)) return c.json({ error: "Session revoked" }, 401);

   const [session] = await db
    .select()
    .from(sessionsTable)
    .where(and(eq(sessionsTable.sessionTokenHash, sessionTokenHash), sql`EXISTS (SELECT 1 FROM ${usersTable} WHERE ${usersTable.id}=${sessionsTable.userId} AND ${usersTable.sessionVersion}=${sessionsTable.sessionVersion})`))
    .limit(1);

  if (!session) {
    return c.json({ error: "Invalid session" }, 401);
  }

  if (session.expiresAt <= new Date() || session.lastUsedAt && Date.now() - session.lastUsedAt.getTime() > 30 * 60_000) {
    return c.json({ error: "Session expired" }, 401);
  }

  c.set("userId", session.userId);
  c.set("sessionId", session.id);
  c.set("mfaVerifiedAt", session.mfaVerifiedAt?.toISOString() ?? null);
  if (session.lastUsedAt && Date.now() - session.lastUsedAt.getTime() > 60_000) await db.update(sessionsTable).set({ lastUsedAt: new Date() }).where(eq(sessionsTable.id, session.id));
  c.set("sessionExpiresAt", session.expiresAt.toISOString());
  await next();
}
