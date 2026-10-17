import { z } from "zod";
import { vaultEntrySchema } from "@password-manager/shared";
import type { DecryptedVaultItem } from "@password-manager/shared";
import type { VaultState } from "../popup/vault/session";

export const lockPolicySchema = z.union([z.literal(0), z.literal(5), z.literal(15), z.literal(30), z.literal("browser")]);
export type LockPolicy = z.infer<typeof lockPolicySchema>;
export const DEFAULT_LOCK_POLICY: LockPolicy = 15;
export const sessionRequestSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("session/view") }).strict(),
  z.object({ type: z.literal("session/status") }).strict(),
  z.object({ type: z.literal("session/unlock"), password: z.string().min(1).max(1024) }).strict(),
  z.object({ type: z.literal("session/lock") }).strict(),
  z.object({ type: z.literal("session/touch") }).strict(),
  z.object({ type: z.literal("session/authorize") }).strict(),
  z.object({ type: z.literal("session/policy"), policy: lockPolicySchema }).strict(),
  z.object({ type: z.literal("session/save"), entry: vaultEntrySchema, itemId: z.string().uuid().optional() }).strict(),
  z.object({ type: z.literal("session/entry"), id: z.string().uuid() }).strict(),
]);
export type SessionRequest = z.infer<typeof sessionRequestSchema>;
export type SessionView = { state: VaultState; items: DecryptedVaultItem[]; deadline: number; policy: LockPolicy };
export type SessionReply = { ok: true; view: SessionView; authorized?: boolean; entry?: DecryptedVaultItem | null; write?: import("./write").WriteResult }
  | { ok: false; error: "unavailable" | "forbidden" };

export function trustedVaultUi(sender: chrome.runtime.MessageSender, extensionId: string) {
  if (sender.id !== extensionId || !sender.url) return false;
  try {
    const url = new URL(sender.url);
    return url.protocol === "chrome-extension:" && url.hostname === extensionId &&
      (url.pathname === "/popup.html" && !url.search && !url.hash ||
       url.pathname === "/fill.html" && /^\?request=[0-9a-f-]{36}$/.test(url.search) && !url.hash);
  } catch { return false; }
}
