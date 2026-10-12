import crypto from "node:crypto";
import { db } from "../db/client.js";
import { sessionsTable } from "../db/schema.js";

export async function createSession(userId: string, proof?: { sessionVersion: number; mfaVerifiedAt?: Date }) {
  // generate token
  const sessionToken = crypto.randomBytes(32).toString("base64url");

  // hash token
  const sessionTokenHash = crypto
    .createHash("sha256")
    .update(sessionToken)
    .digest("hex");

  // calculate expiration
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  // insert session into database
  const [insertedSession] = await db
    .insert(sessionsTable)
    .values({
      userId,
      sessionTokenHash,
      expiresAt,
      sessionVersion: proof?.sessionVersion ?? 0,
      ...(proof?.mfaVerifiedAt ? { mfaVerifiedAt: proof.mfaVerifiedAt } : {}),
    })
    .returning();

  if (!insertedSession) {
    throw new Error("Session creation failed — no row returned.");
  }

  // return token
  return sessionToken;
}
