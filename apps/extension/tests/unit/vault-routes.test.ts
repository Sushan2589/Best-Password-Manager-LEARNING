import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
const mock = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock("../../../api/src/db/client.js", () => ({ db: { execute: mock.execute } }));
vi.mock("../../../api/src/middleware/requireAuth.js", () => ({ requireAuth: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => { c.set("userId", "account-fixture"); await next(); } }));
vi.mock("../../../api/src/middleware/requireEmailVerified.js", () => ({ requireEmailVerified: async (_c: unknown, next: () => Promise<void>) => { await next(); } }));
import routes from "../../../api/routes/vault";
beforeEach(() => {
  vi.clearAllMocks();
  mock.execute.mockResolvedValue({ rows: [{ admitted: 1, item: null }] });
});
describe("vault mutation account and concurrency guards", () => {
  it("denies the wrong account before touching the database", async () => {
    mock.execute.mockClear(); const app = new Hono().route("/vault", routes);
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Vault-Account": "wrong-account" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA" }) });
    expect(response.status).toBe(409); expect(mock.execute).not.toHaveBeenCalled();
  });
  it("makes the ciphertext comparison part of the atomic update and reports conflicts", async () => {
    const app = new Hono().route("/vault", routes);
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Vault-Account": "account-fixture" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA", expectedCipherText: "QkJCQkJCQkJCQkJCQkJCQkJC" }) });
    expect(response.status).toBe(409);
    const query = new PgDialect().sqlToQuery(mock.execute.mock.calls.at(-1)![0]);
    expect(query.params).toContain("00000000-0000-4000-8000-000000000002");
    expect(query.params).toContain("account-fixture"); expect(query.params).toContain("QkJCQkJCQkJCQkJCQkJCQkJC");
    expect(query.sql).toContain("vault_revision"); expect(query.sql).toContain("session_version");
  });
  it("keeps existing callers compatible without extension guards", async () => {
    mock.execute.mockResolvedValue({ rows: [{ admitted: 1, item: { id: "fixture" } }] }); const app = new Hono().route("/vault", routes);
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA" }) });
    expect(response.status).toBe(200);
  });
});
