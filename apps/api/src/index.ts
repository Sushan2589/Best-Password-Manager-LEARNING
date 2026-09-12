import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { cors } from "hono/cors";

const app = new Hono();

app.use("/*", cors({
  origin: "http://localhost:3000", // your Next.js dev origin
  credentials: true,                // needed later for cookies/sessions
}));

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

const port = 3001;
console.log(`API running on http://localhost:${port}`);

serve({ fetch: app.fetch, port });

export default app;