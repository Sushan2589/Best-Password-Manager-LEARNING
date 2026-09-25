import { Hono } from "hono";
import * as z from "zod";
import { eq, and } from "drizzle-orm";

import { requireAuth } from "../src/middleware/requireAuth.js";
import type { Variables } from "../src/types.js";
import { db } from "../src/db/client.js";
import { vaultItemsTable } from "../src/db/schema.js";

const vaultRoutes = new Hono<{ Variables: Variables }>();

const encryptedVaultItemSchema = z.object({
  cipherText: z.string().min(1),
  nonce: z.string().min(1),
});

// GET /vault
vaultRoutes.get("/", requireAuth, async (c) => {
  const userId = c.get("userId");

  try {
    const vaultItems = await db
      .select()
      .from(vaultItemsTable)
      .where(eq(vaultItemsTable.userId, userId));

    return c.json(vaultItems);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// GET /vault/:id
vaultRoutes.get("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!id) {
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
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// POST /vault
vaultRoutes.post("/", requireAuth, async (c) => {
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
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// PATCH /vault/:id
vaultRoutes.patch("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!id) {
    return c.json({ error: "Vault item ID is required" }, 400);
  }

  const body = await c.req.json();
  const validation = encryptedVaultItemSchema.safeParse(body);
  if (!validation.success) {
    return c.json({ error: validation.error.issues }, 400);
  }

  const { cipherText, nonce } = validation.data;

  try {
    const [updatedItem] = await db
      .update(vaultItemsTable)
      .set({ cipherText, nonce, updatedAt: new Date() })
      .where(and(eq(vaultItemsTable.id, id), eq(vaultItemsTable.userId, userId)))
      .returning();

    if (!updatedItem) {
      return c.json({ error: "Vault item not found" }, 404);
    }

    return c.json(updatedItem);
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

// DELETE /vault/:id
vaultRoutes.delete("/:id", requireAuth, async (c) => {
  const userId = c.get("userId");
  const id = c.req.param("id");

  if (!id) {
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
  } catch (error) {
    console.error(error);
    return c.json({ error: "Internal server error" }, 500);
  }
});

export default vaultRoutes;