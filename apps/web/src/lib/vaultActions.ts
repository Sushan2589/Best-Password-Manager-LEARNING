import {
  encryptedVaultItemSchema,
  vaultEntrySchema,
  withCredentialHistory,
} from "@password-manager/shared";
import type { VaultEntry } from "@password-manager/shared";
import { authorizeVaultKey } from "./crypto/vaultSession";
import { getVaultKey } from "./crypto/vaultKeyStore";
import { decrypt, encrypt } from "./crypto/encryption";
import { API_URL } from "./api";
export async function patchCredential(
  id: string,
  changes: Partial<VaultEntry>,
) {
  const authorized = await authorizeVaultKey();
  const response = await fetch(`${API_URL}/vault/${id}`, {
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) throw new Error("Unable to load credential. Please retry.");
  const previous = encryptedVaultItemSchema.parse(await response.json());
  if (previous.userId !== authorized.accountId || previous.id !== id)
    throw new Error("Account changed. Unlock again.");
  const raw = JSON.parse(
    await decrypt(previous.cipherText, previous.nonce, authorized.key),
  );
  const encrypted = await encrypt(
    JSON.stringify({
      ...raw,
      ...withCredentialHistory(
        vaultEntrySchema.parse(raw),
        vaultEntrySchema.parse({ ...raw, ...changes }),
      ),
    }),
    authorized.key,
  );
  if (getVaultKey() !== authorized.key) throw new Error("Vault locked.");
  const result = await fetch(`${API_URL}/vault/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Account": authorized.accountId,
      "X-Vault-Salt": authorized.vaultSalt,
    },
    body: JSON.stringify({
      ...encrypted,
      expectedCipherText: previous.cipherText,
    }),
  });
  if (!result.ok)
    throw new Error(
      result.status === 409
        ? "Credential changed on another device. Reload and retry."
        : "Unable to save. Please retry.",
    );
  if (getVaultKey() !== authorized.key) throw new Error("Vault locked.");
  return encryptedVaultItemSchema.parse(await result.json());
}
