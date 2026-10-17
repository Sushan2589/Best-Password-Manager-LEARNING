import { Hono } from "hono";
import * as z from "zod";
import { eq, and } from "drizzle-orm";

import { requireAuth } from "../src/middleware/requireAuth.js";
import { requireEmailVerified } from "../src/middleware/requireEmailVerified.js";
import type { Variables } from "../src/types.js";
import { db } from "../src/db/client.js";
import { vaultItemsTable } from "../src/db/schema.js";

import { vaultSaltSchema } from "@password-manager/shared/vault";
import { initializeVaultVerifier, mutateVault } from "../src/services/vaultMutation.js";

const vaultRoutes = new Hono<{ Variables: Variables }>();

vaultRoutes.use("*", requireAuth, requireEmailVerified);
// Optional extension guard: bind a mutation to the account that encrypted it.
// Existing web callers remain compatible without this header.
vaultRoutes.use("*", async (c, next) => {
  const expected = c.req.header("X-Vault-Account");
  if (expected && expected !== c.get("userId")) return c.json({ error: "Account changed" }, 409);
  const salt = c.req.header("X-Vault-Salt");
  if (salt !== undefined && !vaultSaltSchema.safeParse(salt).success) return c.json({ error: "Invalid vault version" }, 400);
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
  const admitted = await initializeVaultVerifier({ userId: c.get("userId"), sessionId: c.get("sessionId"), sessionVersion: c.get("sessionVersion") }, c.req.header("X-Vault-Salt"), parsed.data);
  return admitted ? c.json({ ok: true }, 201) : c.json({ error: "Vault already initialized or changed" }, 409);
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
    const result = await mutateVault({ userId, sessionId: c.get("sessionId"), sessionVersion: c.get("sessionVersion") }, c.req.header("X-Vault-Salt"), { kind: "create", cipherText, nonce });
    if (!result.admitted) return c.json({ error: "Vault or session changed; sign in and unlock again" }, 409);
    return c.json(result.item as Record<string, unknown>, 201);
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
    const result = await mutateVault({ userId, sessionId: c.get("sessionId"), sessionVersion: c.get("sessionVersion") }, c.req.header("X-Vault-Salt"), { kind: "update", id, cipherText, nonce, ...(expectedCipherText ? { expectedCipherText } : {}) });
    if (!result.admitted) return c.json({ error: "Vault or session changed; sign in and unlock again" }, 409);
    const updatedItem = result.item as Record<string, unknown> | null;

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
    const result = await mutateVault({ userId, sessionId: c.get("sessionId"), sessionVersion: c.get("sessionVersion") }, c.req.header("X-Vault-Salt"), { kind: "delete", id });
    if (!result.admitted) return c.json({ error: "Vault or session changed; sign in and unlock again" }, 409);
    const deletedItem = result.item;

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
