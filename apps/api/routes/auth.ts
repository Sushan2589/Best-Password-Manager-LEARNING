import { deliverRegistrationVerification } from "../src/services/verificationDelivery.js";
import { Hono } from "hono";
import * as z from "zod";
import { verifyPassword, hashPassword, passwordCompromised } from "../src/services/password.js";
import { consumeVerification } from "../src/services/verification.js";
import { securityLog } from "../src/services/securityLog.js";
import { requireAuth } from "../src/middleware/requireAuth.js";
import type { Variables } from "../src/types.js";
import { checkFactor, mfaRecord } from "../src/services/mfa.js";
import { revocations } from "../src/services/revocations.js";
import crypto from "node:crypto";
import { db } from "../src/db/client.js";
import {
  sessionsTable,
  usersTable,
  emailVerificationTokensTable,
} from "../src/db/schema.js";
import { createSession } from "../src/services/session.js";
import { setCookie, getCookie, deleteCookie } from "hono/cookie";
import { and, eq, desc } from "drizzle-orm";
import {
  generateVerificationToken,
  hashVerificationToken,
} from "../src/utils/emailVerification.js";
import { sendVerificationEmail } from "../src/services/email.js";
import { SESSION_COOKIE_OPTIONS } from "../src/config/security.js";

const authRoutes = new Hono<{ Variables: Variables }>();

const registerSchema = z.object({
  username: z.string().min(3).max(20),
  email: z.string().email().max(254),
  password: z.string().max(1024).refine(value => [...value].length >= 15),
});

const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(6).max(1024),
  code: z.string().max(35).optional(),
});

authRoutes.post("/register", async (c) => {
  //register user logic here
  const body = await c.req.json();
  const validation = registerSchema.safeParse(body);

  if (!validation.success) {
    return c.json({ error: "Invalid input" }, 400);
  }

  const { username, email, password } = validation.data;

  try {
    type NewUser = typeof usersTable.$inferInsert;

    if (await passwordCompromised(password)) return c.json({ error: "Choose a password that has not appeared in a breach." }, 400);
    const hash = await hashPassword(password);
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
      targetEmail: insertedUser.email, purpose: "verify",
      expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 minutes
    });

    deliverRegistrationVerification(insertedUser.email, rawToken);

    return c.json({ message: "If registration can proceed, check your email. Otherwise sign in or request verification." }, 202);
  } catch (error) {
    if (error instanceof Error && ["AUTH_BUSY", "PASSWORD_CHECK_UNAVAILABLE"].includes(error.message)) return c.json({ error: "Registration temporarily unavailable. Try again." }, 503);
    const cause = error instanceof Error ? error.cause : undefined; //DRIZZLEQUERYERROR

    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "23505" // Unique violation error code for PostgreSQL
    ) {
      return c.json({ message: "If registration can proceed, check your email. Otherwise sign in or request verification." }, 202);
    }

    console.error("Authentication operation failed.");
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

    const isMatch = await verifyPassword(user?.passwordHash, password);
    if (!isMatch || !user) { securityLog("auth_failure"); return c.json({ error: "Invalid credentials" }, 401); }
    const factor = await mfaRecord(user.id);
    if (!await checkFactor(user.id, validation.data.code)) return c.json({ error: "MFA_REQUIRED" }, 401);
    const sessionToken = await createSession(user.id, { sessionVersion: user.sessionVersion ?? 0, ...(factor?.enabled ? { mfaVerifiedAt: new Date() } : {}) });

    if (!sessionToken) {
      throw new Error("Session creation failed.");
    }

    setCookie(c, "session", sessionToken, SESSION_COOKIE_OPTIONS);
    securityLog("auth_success");

    return c.json(
      {
        message: "Login successful",
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
        },
        vaultSalt: user.vaultSalt,
      },
      200,
    );
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_BUSY") { c.header("Retry-After", "1"); return c.json({ error: "Service busy. Please retry." }, 503); }
    console.error("Authentication operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});

authRoutes.post("/logout", async (c) => {
  const sessionToken = getCookie(c, "session");
  // Set headers before constructing the response, including revocation failures.
  deleteCookie(c, "session", SESSION_COOKIE_OPTIONS);

  try {
    if (sessionToken && sessionToken.length <= 1024) {
      const sessionTokenHash = crypto
        .createHash("sha256")
        .update(sessionToken)
        .digest("hex");
      try { await revocations.block(sessionTokenHash); } catch { securityLog("operation_failed"); }
      await db
        .delete(sessionsTable)
        .where(eq(sessionsTable.sessionTokenHash, sessionTokenHash));
      await revocations.complete(sessionTokenHash);
    }
    return c.json({ message: "Logged out successfully" }, 200);
  } catch {
    securityLog("session_revocation_failed");
    return c.json({ error: "Unable to revoke session" }, 500);
  }
});

authRoutes.post("/verify-email", async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ token: z.string().regex(/^[a-f0-9]{64}$/) }).safeParse(body);
  if (!parsed.success) {
    return c.json({ message: "Invalid or missing verification token." }, 400);
  }
  const { token } = parsed.data;

  try {
    const consumed = await consumeVerification(token);
    if (!consumed) return c.json({ message: "Invalid or expired verification token." }, 400);
    if (consumed.purpose === "change") deleteCookie(c, "session", SESSION_COOKIE_OPTIONS);
    return c.json({ message: "Email verified successfully. Sign in to continue." });
  } catch { return c.json({ message: "Invalid or expired verification token." }, 400); }

});

authRoutes.post("/resend-verification", requireAuth, async (c) => {
  const body = await c.req.json();
  const parsed = z.object({ email: z.string().email().max(254) }).safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid input" }, 400);
  const { email } = parsed.data;

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, c.get("userId")))
    .limit(1);

  if (!user || user.email !== email) {
    return c.json({ message: "If verification is required, an email will be sent." }, 200);
  }

  if (user.emailVerified) {
    return c.json({ message: "If verification is required, an email will be sent." }, 200);
  }

  const [existingToken] = await db
    .select()
    .from(emailVerificationTokensTable)
    .where(and(eq(emailVerificationTokensTable.userId, user.id), eq(emailVerificationTokensTable.purpose, "verify")))
    .orderBy(desc(emailVerificationTokensTable.createdAt))
    .limit(1);

  if (
    existingToken &&
    Date.now() - existingToken.createdAt.getTime() < 60 * 1000
  ) {
    return c.json({ message: "If verification is required, an email will be sent." }, 200);
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashVerificationToken(rawToken);

  await db
    .delete(emailVerificationTokensTable)
    .where(and(eq(emailVerificationTokensTable.userId, user.id), eq(emailVerificationTokensTable.purpose, "verify")));

  await db.insert(emailVerificationTokensTable).values({
    userId: user.id,
    tokenHash, targetEmail: user.email, purpose: "verify",
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
  });

  try {
    await sendVerificationEmail(user.email, rawToken);
  } catch (error) {
    if (error instanceof Error && error.message === "AUTH_BUSY") { c.header("Retry-After", "1"); return c.json({ error: "Service busy. Please retry." }, 503); }
    console.error("Authentication operation failed.");
    return c.json(
      { error: "Unable to send verification email. Please try again." },
      500,
    );
  }

  return c.json({ message: "If verification is required, an email will be sent." }, 200);
});

export default authRoutes;
