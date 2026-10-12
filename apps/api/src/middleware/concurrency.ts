import type { MiddlewareHandler } from "hono";
export function concurrencyLimit(max = 16): MiddlewareHandler {
  let active = 0;
  let revoking = 0;
  return async (c, next) => {
    const logout = c.req.method === "POST" && c.req.path === "/auth/logout";
    if (logout ? revoking >= 2 : active >= max) { c.header("Retry-After", "1"); return c.json({ error: "Service busy. Please retry." }, 503); }
    if (logout) revoking++; else active++;
    try { await next(); } finally { if (logout) revoking--; else active--; }
  };
}
