import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { SharedRevocationStore, type RevocationQuery } from "../src/services/sharedRevocations.js";
import { revocationDatabaseUrl } from "../src/config/revocations.js";

const pg = new PGlite();
const query: RevocationQuery = async (text, params) => (await pg.query<Record<string, unknown>>(text, params)).rows;
beforeAll(async () => {
  const migration = await readFile(new URL("../migrations/revocations/20261028_shared_revocations.sql", import.meta.url), "utf8");
  await pg.exec(migration);
  await pg.exec(migration); // Repeatable provisioning.
});
afterAll(async () => { await pg.close(); });

describe("shared logout protection against PostgreSQL", () => {
  it("makes committed revocations visible across instances, including database cleanup", async () => {
    const first = new SharedRevocationStore(query);
    const second = new SharedRevocationStore(query);
    const hash = "a".repeat(64);
    expect(await second.denied(hash)).toBe(false);
    await first.block(hash);
    expect(await second.denied(hash)).toBe(true);
    await first.complete(hash);
    expect(await new SharedRevocationStore(query).denied(hash)).toBe(true);
    expect(second.pending()).toEqual([]);
    const { rows } = await pg.query<{ lifetime: number }>("SELECT EXTRACT(EPOCH FROM expires_at - now())::integer AS lifetime FROM session_revocations WHERE session_token_hash=$1", [hash]);
    expect(rows[0]!.lifetime).toBeGreaterThan(6 * 24 * 3600);
  });
  it("handles concurrent logout idempotently and ignores expired tombstones", async () => {
    const store = new SharedRevocationStore(query);
    const hash = "b".repeat(64);
    await Promise.all([store.block(hash), store.block(hash)]);
    expect(await store.denied(hash)).toBe(true);
    await pg.query("UPDATE session_revocations SET expires_at=now()-interval '1 second' WHERE session_token_hash=$1", [hash]);
    expect(await store.denied(hash)).toBe(false);
    await store.block(hash);
    expect(await store.denied(hash)).toBe(true);
  });
  it("rejects malformed hashes and unavailable or malformed storage responses", async () => {
    const store = new SharedRevocationStore(query);
    await expect(store.block("raw-cookie-or-sql-injection")).rejects.toThrow("Invalid session hash");
    const down = new SharedRevocationStore(async () => { throw new Error("unavailable"); });
    await expect(down.denied("c".repeat(64))).rejects.toThrow();
    await expect(new SharedRevocationStore(async () => []).denied("c".repeat(64))).rejects.toThrow();
  });
});

describe("deployment storage configuration", () => {
  it("requires shared storage on Vercel but preserves local development", () => {
    expect(revocationDatabaseUrl({})).toBeUndefined();
    expect(() => revocationDatabaseUrl({ VERCEL: "1" })).toThrow("REVOCATION_DATABASE_URL");
  });
  it("rejects the main endpoint, including its pooler alias, without leaking credentials", () => {
    const env = { DATABASE_URL: "postgresql://user:private@main.example/db", REVOCATION_DATABASE_URL: "postgresql://user:private@main-pooler.example/other" };
    expect(() => revocationDatabaseUrl(env)).toThrow("independent");
    expect(revocationDatabaseUrl({ ...env, REVOCATION_DATABASE_URL: "postgresql://user:private@security.example/db" })).toContain("security.example");
    expect(() => revocationDatabaseUrl({ REVOCATION_DATABASE_URL: "https://private.example" })).toThrow("independent");
  });
});
