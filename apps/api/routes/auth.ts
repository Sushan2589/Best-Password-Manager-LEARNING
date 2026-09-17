import { Hono } from "hono";
import * as z from "zod";
import argon2 from "argon2";
import crypto from "node:crypto";
import { db } from "../src/db/client.js";
import { usersTable } from "../src/db/schema.js";

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


  } catch (error) {
  const cause = error instanceof Error ? error.cause : undefined; //DRIZZLEQUERYERROR 

  if (
    cause &&
    typeof cause === "object" &&
    "code" in cause &&
    cause.code === "23505"  // Unique violation error code for PostgreSQL
  ) {
    return c.json({ error: "Email already registered" }, 409);
  }

  console.error(error);
  return c.json({ error: "Internal server error" }, 500);
}

return c.json({ message: "User registered successfully" }, 201);
});

authRoutes.post("/login", async (c) => {
  //login user logic here
});

export default authRoutes;
