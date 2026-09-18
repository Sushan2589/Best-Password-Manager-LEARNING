import { Hono } from "hono";
import * as z from "zod";
import argon2 from "argon2";
import crypto from "node:crypto";
import { db } from "../src/db/client.js";
import { usersTable } from "../src/db/schema.js";
import { createSession } from "../src/services/session.js";
import { setCookie } from "hono/cookie";

const authRoutes = new Hono();

const registerSchema = z.object({
  username: z.string().min(3).max(20),
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
  //login user logic here
});

export default authRoutes;
