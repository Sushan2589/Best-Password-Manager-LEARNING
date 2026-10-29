import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import authRoutes from "../routes/auth.js";
import userRoutes from "../routes/user.js";
import vaultRoutes from "../routes/vault.js";
import accountSecurity from "../routes/accountSecurity.js";
import mfaRoutes from "../routes/mfa.js";
import vaultPassword from "../routes/vaultPassword.js";
import passwordChange from "../routes/passwordChange.js";
import { trustedOrigin } from "./middleware/trustedOrigin.js";
import { requestBody } from "./middleware/requestBody.js";
import { clientIp, rateLimits, MemoryRateLimiter } from "./middleware/rateLimit.js";
import { SECURITY } from "./config/security.js";
import type { Variables } from "./types.js";
import { concurrencyLimit } from "./middleware/concurrency.js";
import { arcjetProtection } from "./middleware/arcjet.js";
import { createArcjetLimiter, type DistributedRateLimiter } from "./services/arcjet.js";
import { registrationAdmission } from "./middleware/registrationAdmission.js";

export function createApp(options: { limiter?: MemoryRateLimiter; trustedProxies?: readonly string[]; arcjet?: DistributedRateLimiter; resolveIp?: (c: import("hono").Context) => string } = {}) {
  const app = new Hono<{ Variables: Variables }>();
  app.use("*", secureHeaders({ strictTransportSecurity: SECURITY.secureCookies ? "max-age=31536000" : false, xFrameOptions: "DENY", referrerPolicy: "no-referrer" }));
  app.use("*", async (c, next) => { c.header("Cache-Control", "no-store"); await next(); });
  app.use("*", cors({ origin: origin => SECURITY.allowedOrigins.includes(origin) ? origin : undefined, credentials: true, exposeHeaders: ["Retry-After"] }));
  app.use("*", trustedOrigin(SECURITY.allowedOrigins));
  const limiter = options.limiter ?? new MemoryRateLimiter();
  const distributed = options.arcjet ?? createArcjetLimiter();
  const resolveIp = options.resolveIp ?? ((c: import("hono").Context) => clientIp(c, options.trustedProxies));
  app.use("*", rateLimits(limiter, resolveIp, "ip"));
  app.use("*", concurrencyLimit());
  app.use("*", arcjetProtection(distributed, resolveIp, "ip"));
  app.use("*", requestBody);
  app.use("*", rateLimits(limiter, resolveIp, "account"));
  app.use("*", arcjetProtection(distributed, resolveIp, "account"));
  app.use("*", registrationAdmission(limiter, distributed, resolveIp));
  app.onError(error => {
    if (error.message === "AUTH_BUSY") return new Response(JSON.stringify({ error: "Service busy. Please retry." }), { status: 503, headers: { "Content-Type": "application/json", "Cache-Control": "no-store", "Retry-After": "1" } });
    if (error instanceof SyntaxError) return appError(400, "Invalid JSON");
    console.error("API operation failed."); return appError(500, "Internal server error");
  });
  app.route("/auth", authRoutes); app.route("/user", userRoutes); app.route("/vault", vaultPassword); app.route("/vault", vaultRoutes);
  app.route("/security", passwordChange);
  app.route("/security", accountSecurity);
  app.route("/auth/mfa", mfaRoutes);
  return app;
}
function appError(status: 400 | 500, error: string) {
  return new Response(JSON.stringify({ error }), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
