import "dotenv/config";
import { eq } from "drizzle-orm";
import { usersTable } from "../src/db/schema.js";
import crypto from "crypto";
import { db } from "../src/db/client.js";

async function main() {
  const user: typeof usersTable.$inferInsert = {
    name: "John",
    email: "john@example.com",
    passwordHash: "hashed_password",
    vaultSalt: crypto.randomBytes(16).toString("base64"),
  };

    const [insertedUser] = await db.insert(usersTable).values(user).returning();

  if (!insertedUser) {
    throw new Error("Insert failed — no row returned.");
  }
  console.log("New user created!");


  const found = await db.select().from(usersTable).where(eq(usersTable.id, insertedUser.id));
  console.log("Found user: ", found);


  await db
    .update(usersTable)
    .set({
      name: "Sushan",
    })
    .where(eq(usersTable.id, insertedUser.id));
  console.log("User info updated!");

  await db.delete(usersTable).where(eq(usersTable.id, insertedUser.id));
  console.log("User deleted!");
}

main();
