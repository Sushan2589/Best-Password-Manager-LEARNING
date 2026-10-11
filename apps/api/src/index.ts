//RUN npx tsx --env-file=.env src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import authRoutes from "../routes/auth.js";
import { trustedOrigin } from "./middleware/trustedOrigin.js";
import { SECURITY } from "./config/security.js";
import type { Variables } from "./types.js";
import userRoutes from "../routes/user.js";
import vaultRoutes from "../routes/vault.js";

const app = new Hono<{ Variables: Variables }>();

app.use("/*", cors({
  origin: (origin) => SECURITY.allowedOrigins.includes(origin) ? origin : undefined,
  credentials: true,                // needed later for cookies/sessions
}));
app.use("/*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  await next();
});
app.use("/*", trustedOrigin(SECURITY.allowedOrigins));
app.onError(() => {
  console.error("API operation failed.");
  return new Response(JSON.stringify({ error: "Internal server error" }), {
    status: 500, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
});


app.route("/auth",authRoutes);
app.route("/user", userRoutes);
app.route("/vault", vaultRoutes);

const port = 3001;
console.log(`API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;


