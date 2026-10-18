import type { MiddlewareHandler } from "hono";
import type { Variables } from "../types.js";
import { MemoryRateLimiter, RATE_LIMITS } from "./rateLimit.js";
import { enforceArcjet } from "./arcjet.js";
import { securityLog } from "../services/securityLog.js";

const limiter = new MemoryRateLimiter();
// Applied after authentication: a stolen cookie cannot get a fresh guessing
// budget simply by moving to another IP address. Arcjet adds a shared budget.
export const sensitiveAccount: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  if (c.req.method !== "POST") return next();
  const result = limiter.consume("reauth-account", c.get("userId"), RATE_LIMITS.sensitiveAccount);
  if (!result.allowed) {
    securityLog("rate_limit"); c.header("Retry-After", String(result.retryAfter));
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }
  const distributed = c.get("arcjetLimiter");
  if (distributed) {
    const blocked = await enforceArcjet(c, distributed, "reauth-account", c.get("userId"), RATE_LIMITS.sensitiveAccount);
    if (blocked) return blocked;
  }
  await next();
};
