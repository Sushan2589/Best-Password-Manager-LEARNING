import { Hono } from "hono";
import { requireAuth } from "../src/middleware/requireAuth.js";
import type { Variables } from "../src/types.js";


const userRoutes = new Hono<{ Variables: Variables }>();

userRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");
  
    return c.json({ userId });
});


export default userRoutes;