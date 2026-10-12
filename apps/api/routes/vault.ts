import { Hono } from "hono";
import * as z from "zod";
import { eq, and, sql } from "drizzle-orm";

import { requireAuth } from "../src/middleware/requireAuth.js";
import { requireEmailVerified } from "../src/middleware/requireEmailVerified.js";
import type { Variables } from "../src/types.js";
import { db } from "../src/db/client.js";
import { vaultItemsTable } from "../src/db/schema.js";

const vaultRoutes = new Hono<{ Variables: Variables }>();

vaultRoutes.use("*", requireAuth, requireEmailVerified);
// Optional extension guard: bind a mutation to the account that encrypted it.
// Existing web callers remain compatible without this header.
vaultRoutes.use("*", async (c, next) => {
  const expected = c.req.header("X-Vault-Account");
  if (expected && expected !== c.get("userId")) return c.json({ error: "Account changed" }, 409);
  await next();
});

const encryptedVaultItemSchema = z.object({
  cipherText: z.string().min(24).max(1048576).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  nonce: z.string().length(16).regex(/^[A-Za-z0-9+/]{16}$/),
});
const updateVaultItemSchema = encryptedVaultItemSchema.extend({ expectedCipherText: encryptedVaultItemSchema.shape.cipherText.optional() });

vaultRoutes.post("/setup", async c => {
  const parsed = encryptedVaultItemSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid verifier" }, 400);
  const userId = c.get("userId");
  const result = await db.execute(sql`UPDATE users SET vault_verifier_cipher=${parsed.data.cipherText},vault_verifier_nonce=${parsed.data.nonce}
    WHERE id=${userId} AND vault_verifier_cipher IS NULL
    AND NOT EXISTS(SELECT 1 FROM vault_items WHERE user_id=${userId}) RETURNING id`);
  return result.rows.length ? c.json({ ok: true }, 201) : c.json({ error: "Vault already initialized" }, 409);
});

// GET /vault
vaultRoutes.get("/", async (c) => {
  const userId = c.get("userId");

  try {
    const vaultItems = await db
      .select()
      .from(vaultItemsTable)
      .where(eq(vaultItemsTable.userId, userId));

    return c.json(vaultItems);
  } catch {
    console.error("Vault operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /vault/:id
vaultRoutes.get("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Vault item ID is required" }, 400);
  }

  try {
    const [vaultItem] = await db
      .select()
      .from(vaultItemsTable)
      .where(and(eq(vaultItemsTable.id, id), eq(vaultItemsTable.userId, userId)))
      .limit(1);

    if (!vaultItem) {
      return c.json({ error: "Vault item not found" }, 404);
    }

    return c.json(vaultItem);
  } catch {
    console.error("Vault operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /vault
vaultRoutes.post("/", async (c) => {
  const userId = c.get("userId");
  const body = await c.req.json();

  const validation = encryptedVaultItemSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const { cipherText, nonce } = validation.data;

  try {
    const [vaultItem] = await db
      .insert(vaultItemsTable)
      .values({ userId, cipherText, nonce })
      .returning();

    return c.json(vaultItem, 201);
  } catch {
    console.error("Vault operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /vault/:id
vaultRoutes.patch("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Vault item ID is required" }, 400);
  }

  const body = await c.req.json();
  const validation = updateVaultItemSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const { cipherText, nonce, expectedCipherText } = validation.data;

  try {
    const [updatedItem] = await db
      .update(vaultItemsTable)
      .set({ cipherText, nonce, updatedAt: new Date() })
      .where(and(eq(vaultItemsTable.id, id), eq(vaultItemsTable.userId, userId),
        expectedCipherText ? eq(vaultItemsTable.cipherText, expectedCipherText) : undefined))
      .returning();

    if (!updatedItem) {
      if (expectedCipherText) return c.json({ error: "Credential changed; reload before updating" }, 409);
      return c.json({ error: "Vault item not found" }, 404);
    }

    return c.json(updatedItem);
  } catch {
    console.error("Vault operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /vault/:id
vaultRoutes.delete("/:id", async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!z.string().uuid().safeParse(id).success) {
    return c.json({ error: "Vault item ID is required" }, 400);
  }

  try {
    const [deletedItem] = await db
      .delete(vaultItemsTable)
      .where(and(eq(vaultItemsTable.id, id), eq(vaultItemsTable.userId, userId)))
      .returning();

    if (!deletedItem) {
      return c.json({ error: "Vault item not found" }, 404);
    }

    return c.json({ message: "Vault item deleted" });
  } catch {
    console.error("Vault operation failed.");
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default vaultRoutes;
