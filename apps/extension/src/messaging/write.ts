import { z } from "zod";
import { encryptedVaultItemSchema, vaultSaltSchema } from "@password-manager/shared";
export const writeRequestSchema = z.object({ type: z.literal("vault/write"), accountId: z.string().uuid(), vaultSalt: vaultSaltSchema.optional(), itemId: z.string().uuid().optional(),
  cipherText: z.string().min(24).max(1048576).regex(/^[A-Za-z0-9+/]+={0,2}$/), nonce: encryptedVaultItemSchema.shape.nonce,
  expectedCipherText: z.string().min(24).max(1048576).optional() }).strict().refine(value => Boolean(value.itemId) === Boolean(value.expectedCipherText));
export type WriteRequest = z.infer<typeof writeRequestSchema>;
export type WriteResult = { ok: true; item: z.infer<typeof encryptedVaultItemSchema> } |
  { ok: false; error: "unavailable" | "unauthenticated" | "unverified" | "account-changed" | "conflict" | "invalid-response" };
