import { Hono } from "hono";
import * as z from "zod";
import argon2 from "argon2";
import crypto from "node:crypto";
import { db } from "../src/db/client.js";
import { sessionsTable, usersTable } from "../src/db/schema.js";
import { createSession } from "../src/services/session.js";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";

const authRoutes = new Hono();

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email(),
  password: z.string().min(6),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

authRoutes.post("/register", async (c) => {
  //register user logic here
  const body = await c.req.json();
  const validation = registerSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { username, email, password } = validation.data;
  console.log("Registration validation successful");

  try {
    type NewUser = typeof usersTable.$inferInsert;

    const hash = await argon2.hash(password);
    const user: NewUser = {
      name: username,
      email: email,
      passwordHash: hash,
      vaultSalt: crypto.randomBytes(16).toString("base64"),
    };

    const [insertedUser] = await db.insert(usersTable).values(user).returning();

    if (!insertedUser) {
      throw new Error("Insert failed — no row returned.");
    }

    console.log("User registered successfully:", insertedUser.id);
    const sessionToken = await createSession(insertedUser.id);

    if (!sessionToken) {
      throw new Error("Session creation failed.");
    }

    setCookie(c, "session", sessionToken, {
      httpOnly: true,
      secure: false, // Set to true in production
      sameSite: "lax",
      path: "/",
    });

    return c.json(
      {
        message: "User registered successfully",
        user: {
          id: insertedUser.id,
          email: insertedUser.email,
          name: insertedUser.name,
        },
        vaultSalt: insertedUser.vaultSalt,
      },
      201,
    );
  } catch (error) {
    const cause = error instanceof Error ? error.cause : undefined; //DRIZZLEQUERYERROR

    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "23505" // Unique violation error code for PostgreSQL
    ) {
      return c.json({ error: "Email already registered" }, 409);
    }

    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json();
  const validation = loginSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { email, password } = validation.data;

  try {
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, email))
      .limit(1);

    if (!user) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const isMatch = await argon2.verify(user.passwordHash, password);

    if (!isMatch) {
      return c.json({ error: "Invalid credentials" }, 401);
    }

    const sessionToken = await createSession(user.id);

    if (!sessionToken) {
      throw new Error("Session creation failed.");
    }

    setCookie(c, "session", sessionToken, {
      httpOnly: true,
      secure: false, // Set to true in production
      sameSite: "lax",
      path: "/",
    });

    return c.json(
      {
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
        },
        vaultSalt: user.vaultSalt,
      },
      200,
    );
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

authRoutes.post("/logout", async (c) => {
  const sessionToken = getCookie(c, "session");

  if (sessionToken) {
    const sessionTokenHash = crypto
      .createHash("sha256")
      .update(sessionToken)
      .digest("hex");
    await db
      .delete(sessionsTable)
      .where(eq(sessionsTable.sessionTokenHash, sessionTokenHash));
  }

  deleteCookie(c, "session", { path: "/" });

  return c.json({ message: "Logged out successfully" }, 200);
});

export default authRoutes;
