import type { Context, MiddlewareHandler } from "hono";
import type { Variables } from "../types.js";
import type { DistributedRateLimiter } from "../services/arcjet.js";
import { MemoryRateLimiter, RATE_LIMITS } from "./rateLimit.js";
import { enforceArcjet } from "./arcjet.js";

// The broader attempt limits protect parsing and password-breach lookups.
// These stricter quotas run only after input and password validation succeeds.
export function registrationAdmission(local: MemoryRateLimiter, remote: DistributedRateLimiter | undefined,
  resolveIp: (c: Context) => string): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    if (c.req.method === "POST" && c.req.path === "/auth/register") {
      c.set("registrationAdmission", async email => {
        const policies = [
          ["registration-create-ip", resolveIp(c), RATE_LIMITS.registerIp],
          ["registration-create-account", email.trim().toLowerCase(), RATE_LIMITS.registerAccount],
        ] as const;
        for (const [scope, identity, policy] of policies) {
          const result = local.consume(scope, identity, policy);
          if (!result.allowed) {
            c.header("Retry-After", String(result.retryAfter));
            return c.json({ error: "Too many registration attempts. Please try again later." }, 429);
          }
          if (remote) {
            const blocked = await enforceArcjet(c, remote, scope, identity, policy);
            if (blocked) return blocked;
          }
        }
        return undefined;
      });
    }
    await next();
  };
}
