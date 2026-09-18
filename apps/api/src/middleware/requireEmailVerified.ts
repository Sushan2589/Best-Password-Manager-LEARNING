import type { Context, Next } from "hono";
import { usersTable } from "../db/schema.js";
import { db } from "../db/client.js";
import { eq } from "drizzle-orm";
import type { Variables } from "../types.js";

export async function requireEmailVerified(c: Context<{ Variables: Variables }>, next: Next) {
  const userId = c.get('userId');   // already set by requireAuth, which ran first
  const user = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  
  if (!user[0]?.emailVerified) {
    return c.json({ error: "Please verify your email first" }, 403);
  }
  
  await next();
}




//vault.use("*", requireAuth, requireEmailVerified);