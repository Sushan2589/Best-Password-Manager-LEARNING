import * as z from "zod";

export const vaultEntrySchema = z.object({
  title: z.string().min(1).max(100),
  username: z.string().max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1),
  website: z.string().url().optional(),
  approvedOrigins: z.array(z.string().max(2048).refine(value => {
    try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password && url.origin === value; }
    catch { return false; }
  }, "Use an exact HTTPS login origin")).max(20).optional(),
  notes: z.string().max(5000).optional(),
}).refine(data => Boolean(data.username) || Boolean(data.email), {
  message: "Username or email is required",
});

export type VaultEntry = z.infer<typeof vaultEntrySchema>;

export const encryptedVaultItemSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  cipherText: z.string().min(24).max(1048576),
  nonce: z.string().length(16).regex(/^[A-Za-z0-9+/]{16}$/),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type EncryptedVaultItem = z.infer<typeof encryptedVaultItemSchema>;
export type DecryptedVaultItem = VaultEntry & Pick<EncryptedVaultItem, "id" | "createdAt" | "updatedAt">;

export const vaultSaltSchema = z.string().regex(/^[A-Za-z0-9+/]{22}==$/).refine(value => {
  try { return atob(value).length === 16 && btoa(atob(value)) === value; } catch { return false; }
});
export const vaultEnvelopeSchema = z.object({
  cipherText: z.string().min(24).max(1048576).regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
  nonce: encryptedVaultItemSchema.shape.nonce,
}).strict();
export const vaultRotationSnapshotSchema = z.object({
  accountId: z.string().uuid(), vaultSalt: vaultSaltSchema,
  revision: z.number().int().nonnegative(), keyVersion: z.number().int().nonnegative(),
  verifier: vaultEnvelopeSchema.nullable(), items: z.array(encryptedVaultItemSchema).max(5000),
}).strict().refine(value => value.items.every(item => item.userId === value.accountId) && new Set(value.items.map(item => item.id.toLowerCase())).size === value.items.length);
export const vaultRotationSchema = z.object({
  expectedSalt: vaultSaltSchema, expectedRevision: z.number().int().nonnegative(),
  newSalt: vaultSaltSchema, verifier: vaultEnvelopeSchema,
  items: z.array(vaultEnvelopeSchema.extend({ id: z.string().uuid() })).max(5000),
}).strict().refine(value => value.newSalt !== value.expectedSalt && new Set(value.items.map(item => item.id.toLowerCase())).size === value.items.length);
export type VaultRotation = z.infer<typeof vaultRotationSchema>;
