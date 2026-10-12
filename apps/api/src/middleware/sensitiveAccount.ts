import type { MiddlewareHandler } from "hono";
import type { Variables } from "../types.js";
import { MemoryRateLimiter } from "./rateLimit.js";
import { securityLog } from "../services/securityLog.js";

const limiter = new MemoryRateLimiter();
// Applied after authentication: a stolen cookie cannot get a fresh guessing
// budget simply by moving to another IP address. Arcjet will add edge controls.
export const sensitiveAccount: MiddlewareHandler<{ Variables: Variables }> = async (c, next) => {
  if (c.req.method !== "POST") return next();
  const result = limiter.consume("reauth-account", c.get("userId"), { max: 10, windowMs: 15 * 60_000 });
  if (!result.allowed) {
    securityLog("rate_limit"); c.header("Retry-After", String(result.retryAfter));
    return c.json({ error: "Too many requests. Please try again later." }, 429);
  }
  await next();
};
