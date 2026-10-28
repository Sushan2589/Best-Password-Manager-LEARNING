import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { resolve, join } from "node:path";
import { neon } from "@neondatabase/serverless";
import { revocationDatabaseUrl } from "../config/revocations.js";
import { SharedRevocationStore, type RevocationStore } from "./sharedRevocations.js";

// Durable single-server retry barrier. Only SHA-256 hashes are recorded, never
// raw cookies. Share/replace this storage deliberately for replicated deployment.
export class RevocationBarrier {
  private hashes = new Map<string, number>(); private denyAll = false;
  private file: string | undefined;
  constructor(directory?: string) {
    if (directory) {
      mkdirSync(directory, { recursive: true, mode: 0o700 }); this.file = join(directory, "pending-revocations.json");
      try {
        const value = JSON.parse(readFileSync(this.file, "utf8"));
        if (!Array.isArray(value.hashes) || typeof value.denyAll !== "boolean") throw new Error();
        this.denyAll = value.denyAll;
        for (const [hash, expires] of value.hashes) {
          if (!/^[a-f0-9]{64}$/.test(hash) || typeof expires !== "number") throw new Error();
          if (expires > Date.now()) this.hashes.set(hash, expires);
        }
      } catch (error) { if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw new Error("Security state storage invalid."); }
      this.persist();
    }
  }
  private persist() {
    if (!this.file) return;
    try {
      writeFileSync(`${this.file}.tmp`, JSON.stringify({ denyAll: this.denyAll, hashes: [...this.hashes] }), { mode: 0o600 });
      renameSync(`${this.file}.tmp`, this.file);
    } catch { this.denyAll = true; throw new Error("Security state storage unavailable."); }
  }
  block(hash: string) {
    if (this.hashes.size >= 4096 && !this.hashes.has(hash)) this.denyAll = true;
    else this.hashes.set(hash, Date.now() + 7 * 24 * 60 * 60_000);
    this.persist();
  }
  complete(hash: string) { this.hashes.delete(hash); this.persist(); }
  denied(hash: string) { return this.denyAll || (this.hashes.get(hash) ?? 0) > Date.now(); }
  pending() { return [...this.hashes.keys()]; }
}
function createRevocations(): RevocationStore {
  const url = revocationDatabaseUrl();
  if (url) {
    const sql = neon(url);
    return new SharedRevocationStore(async (text, params) => sql.query(text, params, {
      fetchOptions: { signal: AbortSignal.timeout(10_000), cache: "no-store" },
    }));
  }
  return new RevocationBarrier(process.env.NODE_ENV === "test" ? undefined : resolve(process.env.SECURITY_STATE_DIR ?? ".security-state"));
}

export const revocations = createRevocations();
