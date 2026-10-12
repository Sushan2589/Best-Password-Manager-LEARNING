import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { PgDialect } from "drizzle-orm/pg-core";
const mock = vi.hoisted(() => ({ where: vi.fn(), returning: vi.fn(), update: vi.fn(), set: vi.fn() }));
vi.mock("../../../api/src/db/client.js", () => ({ db: { update: mock.update } }));
vi.mock("../../../api/src/middleware/requireAuth.js", () => ({ requireAuth: async (c: { set: (key: string, value: string) => void }, next: () => Promise<void>) => { c.set("userId", "account-fixture"); await next(); } }));
vi.mock("../../../api/src/middleware/requireEmailVerified.js", () => ({ requireEmailVerified: async (_c: unknown, next: () => Promise<void>) => { await next(); } }));
import routes from "../../../api/routes/vault";
beforeEach(() => {
  vi.clearAllMocks();
  mock.update.mockReturnValue({ set: mock.set }); mock.set.mockReturnValue({ where: mock.where });
  mock.where.mockReturnValue({ returning: mock.returning }); mock.returning.mockResolvedValue([]);
});
describe("vault mutation account and concurrency guards", () => {
  it("denies the wrong account before touching the database", async () => {
    mock.update.mockClear(); const app = new Hono().route("/vault", routes);
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Vault-Account": "wrong-account" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA" }) });
    expect(response.status).toBe(409); expect(mock.update).not.toHaveBeenCalled();
  });
  it("makes the ciphertext comparison part of the atomic update and reports conflicts", async () => {
    const app = new Hono().route("/vault", routes);
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { "Content-Type": "application/json", "X-Vault-Account": "account-fixture" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA", expectedCipherText: "QkJCQkJCQkJCQkJCQkJCQkJC" }) });
    expect(response.status).toBe(409);
    const query = new PgDialect().sqlToQuery(mock.where.mock.calls.at(-1)![0]);
    expect(query.params).toEqual(["00000000-0000-4000-8000-000000000002", "account-fixture", "QkJCQkJCQkJCQkJCQkJCQkJC"]);
  });
  it("keeps existing callers compatible without extension guards", async () => {
    mock.returning.mockResolvedValue([{ id: "fixture" }]); const app = new Hono().route("/vault", routes);
    const response = await app.request("/vault/00000000-0000-4000-8000-000000000002", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cipherText: "QUFBQUFBQUFBQUFBQUFBQUFB", nonce: "AAAAAAAAAAAAAAAA" }) });
    expect(response.status).toBe(200);
  });
});
