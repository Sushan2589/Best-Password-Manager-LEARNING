//RUN npx tsx --env-file=.env src/index.ts
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";
import authRoutes from "../routes/auth.js";

const app = new Hono();

app.use("/*", cors({
  origin: "http://localhost:3000", // your Next.js dev origin
  credentials: true,                // needed later for cookies/sessions
}));

app.route("/auth",authRoutes);

const port = 3001;
console.log(`API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;


