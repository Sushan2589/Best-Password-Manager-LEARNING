import type { MiddlewareHandler } from "hono";

// Origin validation is CSRF protection, not authentication. Sessions still authorize requests.
export function trustedOrigin(allowedOrigins: readonly string[]): MiddlewareHandler {
  const allowed = new Set(allowedOrigins);
  return async (c, next) => {
    if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
      const origin = c.req.header("Origin");
      if (!origin || !allowed.has(origin)) return c.json({ error: "ORIGIN_NOT_ALLOWED" }, 403);
    }
    await next();
  };
}
