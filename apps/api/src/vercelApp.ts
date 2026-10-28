import { Hono } from "hono";

export function mountApi(app: Hono, api: { fetch: Hono["fetch"] }) {
  // Services preserves /api. Strip it once here, before ALL API middleware,
  // so auth quotas, body limits, logout concurrency and routes see the same path
  // as local development. mount() preserves method, body, headers and query.
  app.use("*", async (c, next) => {
    c.header("Cache-Control", "no-store");
    await next();
  });
  app.mount("/api", api.fetch);
  return app;
}
