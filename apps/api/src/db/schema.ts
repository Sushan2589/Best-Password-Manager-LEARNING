//npx drizzle-kit push  


import { pgTable, uuid, text, varchar, boolean, timestamp, bigint, integer } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: text("email").notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  vaultSalt: text("vault_salt").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
  pendingEmail: text("pending_email"),
  sessionVersion: integer("session_version").notNull().default(0),
  vaultVerifierCipher: text("vault_verifier_cipher"),
  vaultVerifierNonce: text("vault_verifier_nonce"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
});



//onUpdate is a function that will be called whenever the row is updated. In this case, we are setting the updated_at column to the current date and time whenever the row is updated.
//This onUpdate thing is a feature of Drizzle ORM that allows you to automatically update the updated_at column whenever the row is updated. This much robustness is okay for now as we are not using any other database than Postgres. If we were to use other databases, we would have to implement this feature ourselves. But for now, this is okay.


export const sessionsTable = pgTable("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  sessionTokenHash: text("session_token_hash").notNull().unique(),
  expiresAt: timestamp("expires_at").notNull(),
  lastUsedAt: timestamp("last_used_at").notNull().defaultNow(),
  mfaVerifiedAt: timestamp("mfa_verified_at"),
  sessionVersion: integer("session_version").notNull().default(0),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const vaultItemsTable = pgTable("vault_items", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  cipherText: text("cipher_text").notNull(),
  nonce: text("nonce").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow().$onUpdate(() => new Date()),
})

export const emailVerificationTokensTable = pgTable("email_verification_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  targetEmail: text("target_email").notNull(),
  purpose: text("purpose").notNull().default("verify"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
})

export const mfaTable = pgTable("account_mfa", {
  userId: uuid("user_id").primaryKey().references(() => usersTable.id, { onDelete: "cascade" }),
  cipherText: text("cipher_text").notNull(), nonce: text("nonce").notNull(),
  enabled: boolean("enabled").notNull().default(false),
  setupExpiresAt: timestamp("setup_expires_at").notNull(),
  lastUsedStep: bigint("last_used_step", { mode: "number" }).notNull().default(0),
});
export const recoveryCodesTable = pgTable("mfa_recovery_codes", {
  codeHash: text("code_hash").primaryKey(),
  userId: uuid("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
});

// I'd allow only one active verification token per user. Your current schema doesn't enforce that at the database level, which is fine. We'll handle it in the application:
