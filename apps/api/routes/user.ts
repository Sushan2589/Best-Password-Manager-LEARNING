import { Hono } from "hono";
import { requireAuth } from "../src/middleware/requireAuth.js";
import type { Variables } from "../src/types.js";
import { usersTable } from "../src/db/schema.js";
import { db } from "../src/db/client.js";
import { eq } from "drizzle-orm";

const userRoutes = new Hono<{ Variables: Variables }>();

// routes/user.ts (or add to auth.ts)
userRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, vaultSalt: usersTable.vaultSalt })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(user);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});


export default userRoutes;