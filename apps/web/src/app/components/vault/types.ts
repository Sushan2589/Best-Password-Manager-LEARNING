import type { VaultEntry } from "@/lib/validation/vaultEntry";

export type DecryptedVaultItem = VaultEntry & {
  id: string;
  createdAt?: string;
  updatedAt?: string;
};

export type VaultItem = {
  id: string;
  userId: string;
  cipherText: string;
  nonce: string;
  createdAt: string;
  updatedAt: string;
};