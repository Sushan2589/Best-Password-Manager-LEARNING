//RUN npx tsx --env-file=.env src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import authRoutes from "../routes/auth.js";
import { requireAuth } from "./middleware/requireAuth.js";
import type { Variables } from "./types.js";
import userRoutes from "../routes/user.js";
import vaultRoutes from "../routes/vault.js";

const app = new Hono<{ Variables: Variables }>();

app.use("/*", cors({
  origin: "http://localhost:3000", // your Next.js dev origin
  credentials: true,                // needed later for cookies/sessions
}));


app.route("/auth",authRoutes);
app.route("/user", userRoutes);
app.route("/vault", vaultRoutes);

const port = 3001;
console.log(`API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;


