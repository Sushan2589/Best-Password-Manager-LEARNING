//npx drizzle-kit push  


import { pgTable, uuid, text, varchar, bytea, boolean, timestamp } from "drizzle-orm/pg-core";

export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 255 }).notNull(),
  email: text("email").notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  vaultSalt: text("vault_salt").notNull(),
  emailVerified: boolean("email_verified").notNull().default(false),
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
})