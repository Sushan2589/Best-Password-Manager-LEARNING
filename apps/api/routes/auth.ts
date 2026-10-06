import { Hono } from "hono";
import * as z from "zod";
import argon2 from "argon2";
import crypto from "node:crypto";
import { db } from "../src/db/client.js";
import {
  sessionsTable,
  usersTable,
  emailVerificationTokensTable,
} from "../src/db/schema.js";
import { createSession } from "../src/services/session.js";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { eq } from "drizzle-orm";
import {
  generateVerificationToken,
  hashVerificationToken,
} from "../src/utils/emailVerification.js";
import { sendVerificationEmail } from "../src/services/email.js";

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

    const rawToken = generateVerificationToken();
    const tokenHash = hashVerificationToken(rawToken);

    await db.insert(emailVerificationTokensTable).values({
      userId: insertedUser.id,
      tokenHash: tokenHash,
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });

    try {
      await sendVerificationEmail(insertedUser.email, rawToken);
    } catch (error) {
      console.error("Failed to send verification email:", error);

      return c.json(
        { error: "Unable to send verification email. Please try again." },
        500,
      );
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

authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json();
  const { token } = body;

  if (!token || typeof token !== "string") {
    return c.json({ message: "Invalid or missing verification token." }, 400);
  }

  const tokenHash = hashVerificationToken(token);

  const [verificationToken] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.tokenHash, tokenHash))
    .limit(1);

  if (!verificationToken) {
    return c.json({ message: "Invalid or expired verification token." }, 400);
  }

  if (verificationToken.expiresAt < new Date()) {
    return c.json({ message: "Invalid or expired verification token." }, 400);
  }

  const [updatedUser] = await db
    .update(usersTable)
    .set({ emailVerified: true })
    .where(eq(usersTable.id, verificationToken.userId))
    .returning();

  if (!updatedUser) {
    return c.json({ message: "User not found." }, 404);
  }

  await db
    .delete(emailVerificationTokensTable)
    .where(eq(emailVerificationTokensTable.id, verificationToken.id));

  return c.json({
    message: "Email verified successfully.",
  });
});

authRoutes.post("/resend-verification", async (c) => {
  const body = await c.req.json();
  const { email } = body;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user) {
    return c.json({ message: "User not found." }, 404);
  }

  if (user.emailVerified) {
    return c.json({ message: "Email is already verified." }, 400);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(rawToken);

  await db
  .delete(emailVerificationTokensTable)
  .where(eq(emailVerificationTokensTable.userId, user.id));

  await db.insert(emailVerificationTokensTable).values({
    userId: user.id,
    tokenHash,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  try {
    await sendVerificationEmail(user.email, rawToken);
  } catch (error) {
    console.error("Failed to send verification email:", error);
    return c.json(
      { error: "Unable to send verification email. Please try again." },
      500
    );
  }

  return c.json({ message: "Verification email sent." }, 200);
});

export default authRoutes;
