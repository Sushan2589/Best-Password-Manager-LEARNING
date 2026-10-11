import type { AuthResult } from "../messaging/auth";
import type { VaultResult } from "../messaging/vault";
import type { WriteRequest, WriteResult } from "../messaging/write";
import { VaultSession } from "../popup/vault/session";
import { sessionRequestSchema, lockPolicySchema } from "../messaging/session";
import { SessionOwner } from "./owner";

const scope = self as unknown as { postMessage: (message: unknown) => void; onmessage: ((event: MessageEvent) => void) | null };
const pending = new Map<string, (result: unknown) => void>();
function api<T>(request: { type: "auth/session" | "vault/snapshot" } | WriteRequest): Promise<T> {
  const apiId = crypto.randomUUID();
  return new Promise(resolve => {
    const timer = setTimeout(() => { pending.delete(apiId); resolve({ ok: false, error: "unavailable" } as T); }, 25000);
    pending.set(apiId, result => { clearTimeout(timer); resolve(result as T); });
    scope.postMessage({ apiId, api: request });
  });
}
const auth = () => api<AuthResult>({ type: "auth/session" });
const vault = new VaultSession({ snapshot: () => api<VaultResult>({ type: "vault/snapshot" }), validateSession: auth, write: request => api<WriteResult>(request) });
const owner = new SessionOwner(vault, auth, 5, Date.now, () => scope.postMessage({ changed: true, status: vault.getSnapshot().status }));
// Revalidate before every exposure/fill/write. Idle expiry runs locally without
// periodic API messages that would artificially keep the MV3 worker alive.
scope.onmessage = event => {
  if (event.data?.apiId && "result" in event.data) {
    const resolve = pending.get(event.data.apiId);
    if (resolve) { pending.delete(event.data.apiId); resolve(event.data.result); }
    return;
  }
  const { id, request, policy } = event.data ?? {};
  if (lockPolicySchema.safeParse(policy).success) void owner.handle({ type: "session/policy", policy });
  const parsed = sessionRequestSchema.safeParse(request);
  if (typeof id !== "string" || !parsed.success) return;
  void owner.handle(parsed.data).then(result => scope.postMessage({ id, result })).catch(() => {
    owner.lock(); scope.postMessage({ id, result: { ok: false, error: "unavailable" } });
  });
};
