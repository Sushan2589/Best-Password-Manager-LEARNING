import * as z from "zod";
export { generatePassword, DEFAULT_CHARACTER_OPTIONS, type CharacterOptions } from "./generator";

export const vaultEntrySchema = z.object({
  title: z.string().min(1).max(100),
  username: z.string().max(255).optional(),
  email: z.string().email().optional(),
  password: z.string().min(1),
  website: z.string().url().optional(),
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
