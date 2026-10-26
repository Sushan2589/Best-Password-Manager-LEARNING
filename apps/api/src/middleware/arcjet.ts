import type { Context, MiddlewareHandler } from "hono";
import type { Variables } from "../types.js";
import type { DistributedRateLimiter } from "../services/arcjet.js";
import { securityLog } from "../services/securityLog.js";
import { emailRatePolicy, ipRatePolicies, type RateLimitPolicy } from "./rateLimit.js";

export async function enforceArcjet(c: Context, limiter: DistributedRateLimiter, scope: string, identity: string, policy: RateLimitPolicy): Promise<Response | void> {
  const result = await limiter.check(scope, identity, policy);
  if (result.status === "deny") {
    securityLog("arcjet_blocked"); c.header("Retry-After", String(result.retryAfter));
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }
  if (result.status === "error" && scope !== "logout-ip") {
    c.header("Retry-After", "5");
    return c.json({ error: "Security service temporarily unavailable. Please retry." }, 503);
  }
  // Logout is a safety action: on provider outage, retain its independent local
  // limit and reserved concurrency, then clear/revoke the existing session.
}

export function arcjetProtection(limiter: DistributedRateLimiter | undefined, resolveIp: (c: Context) => string, phase: "ip" | "account"): MiddlewareHandler<{ Variables: Variables }> {
  return async (c, next) => {
    if (!limiter || c.req.method === "OPTIONS") return next();
    if (phase === "ip") {
      c.set("arcjetLimiter", limiter);
      for (const policy of ipRatePolicies(c.req.method, c.req.path, resolveIp(c))) {
        const blocked = await enforceArcjet(c, limiter, ...policy);
        if (blocked) return blocked;
      }
    } else if (c.req.method === "POST" && ["/auth/login", "/auth/register", "/auth/resend-verification"].includes(c.req.path)) {
      const policy = emailRatePolicy(c.req.path, await c.req.json());
      if (policy) {
        const blocked = await enforceArcjet(c, limiter, ...policy);
        if (blocked) return blocked;
      }
    }
    await next();
  };
}
