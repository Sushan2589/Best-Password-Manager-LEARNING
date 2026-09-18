import type { Context, Next } from "hono";
import { getCookie } from "hono/cookie";
import crypto from "node:crypto";
import { sessionsTable } from "../db/schema.js";
import { db } from "../db/client.js";
import { eq } from "drizzle-orm";
import type { Variables } from "../types.js";

export async function requireAuth(c: Context<{ Variables: Variables }>, next: Next) {
  const sessionToken = getCookie(c, "session");

  if (!sessionToken) {
    return c.json({ error: "Missing session token" }, 401);
  }

  const sessionTokenHash = crypto.createHash("sha256").update(sessionToken).digest("hex");

   const [session] = await db
    .select()
    .from(sessionsTable)
    .where(eq(sessionsTable.sessionTokenHash, sessionTokenHash))
    .limit(1);

  if (!session) {
    return c.json({ error: "Invalid session" }, 401);
  }

  if (session.expiresAt < new Date()) {
    return c.json({ error: "Session expired" }, 401);
  }

  c.set("userId", session.userId);
  await next();
}
