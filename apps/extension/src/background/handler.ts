import { isConnectionRequest, type ConnectionResult } from "../messaging/protocol";
import { isAuthRequest, type AuthRequest, type AuthResult } from "../messaging/auth";
import { isVaultRequest, type VaultResult } from "../messaging/vault";
import { writeRequestSchema, type WriteRequest, type WriteResult } from "../messaging/write";

type Sender = Pick<chrome.runtime.MessageSender, "id" | "url">;

export async function handleMessage(
  message: unknown,
  sender: Sender,
  extensionId: string,
  popupUrl: string,
  probe: () => Promise<ConnectionResult>,
  auth?: (request: AuthRequest) => Promise<AuthResult>,
  vault?: () => Promise<VaultResult>,
  write?: (request: WriteRequest) => Promise<WriteResult>,
): Promise<ConnectionResult | AuthResult | VaultResult | WriteResult> {
  // Never grant a content script (even one belonging to this extension) API access.
  // The same packaged popup may be opened as an extension tab for testing.
  // Browser-provided sender.url still excludes content scripts on web pages.
  if (sender.id !== extensionId || sender.url !== popupUrl) {
    return { ok: false, error: "forbidden" };
  }
  try {
    if (isConnectionRequest(message)) return await probe();
    if (auth && isAuthRequest(message)) return await auth(message);
    if (vault && isVaultRequest(message)) return await vault();
    const mutation = writeRequestSchema.safeParse(message);
    if (write && mutation.success) return await write(mutation.data);
    return { ok: false, error: "forbidden" };
  } catch {
    return { ok: false, error: "unavailable" };
  }
}
