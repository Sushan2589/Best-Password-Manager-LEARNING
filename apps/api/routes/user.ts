import { Hono } from "hono";
import { requireAuth } from "../src/middleware/requireAuth.js";
import type { Variables } from "../src/types.js";
import { usersTable } from "../src/db/schema.js";
import { db } from "../src/db/client.js";
import { eq } from "drizzle-orm";
import { z } from "zod";

const userRoutes = new Hono<{ Variables: Variables }>();


userRoutes.get("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  try {
    const [user] = await db
      .select({ id: usersTable.id, email: usersTable.email, name: usersTable.name, vaultSalt: usersTable.vaultSalt, vaultKeyVersion: usersTable.vaultKeyVersion, emailVerified: usersTable.emailVerified, pendingEmail: usersTable.pendingEmail, vaultVerifierCipher: usersTable.vaultVerifierCipher, vaultVerifierNonce: usersTable.vaultVerifierNonce })
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);

    if (!user) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json({ ...user, sessionExpiresAt: c.get("sessionExpiresAt") });
  } catch {
    console.error("Profile operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});


userRoutes.patch("/me", requireAuth, async (c) => {
  const userId = c.get("userId");

  try {
    const body = await c.req.json();
    if (!body || typeof body !== "object" || Array.isArray(body) ||
        body.name !== undefined && typeof body.name !== "string" || body.email !== undefined && typeof body.email !== "string") {
      return c.json({ error: "Invalid input" }, 400);
    }

    const name =
      typeof body.name === "string"
        ? body.name.trim()
        : undefined;

    const email =
      typeof body.email === "string"
        ? body.email.trim().toLowerCase()
        : undefined;

    if (name !== undefined && (name.length < 2 || name.length > 50)) {
      return c.json(
        { error: "Name must be between 2 and 50 characters." },
        400
      );
    }

    if (
      email !== undefined &&
      !z.string().email().max(254).safeParse(email).success
    ) {
      return c.json(
        { error: "Please provide a valid email address." },
        400
      );
    }

    if (email !== undefined) {
      const [existingUser] = await db
        .select({ id: usersTable.id, email: usersTable.email })
        .from(usersTable)
        .where(eq(usersTable.id, userId))
        .limit(1);

      if (!existingUser) return c.json({ error: "Session unavailable" }, 401);
      if (existingUser.email.toLowerCase() !== email) return c.json({ error: "Use the verified email-change flow." }, 409);
    }

    const updateData: {
      name?: string;
      email?: string;
    } = {};

    if (name !== undefined) {
      updateData.name = name;
    }


    if (Object.keys(updateData).length === 0) {
      return c.json(
        { error: "No changes provided." },
        400
      );
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, userId))
      .returning({
        id: usersTable.id,
        email: usersTable.email,
        name: usersTable.name,
        vaultSalt: usersTable.vaultSalt, vaultKeyVersion: usersTable.vaultKeyVersion,
      });

    if (!updatedUser) {
      return c.json({ error: "User not found" }, 404);
    }

    return c.json(updatedUser);
  } catch {
    console.error("Profile operation failed.");
    return c.json(
      { error: "Internal server error" },
      500
    );
  }
});


export default userRoutes;
