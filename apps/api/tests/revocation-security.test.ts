import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { RevocationBarrier } from "../src/services/revocations.js";

describe("durable logout failure protection", () => {
  it("blocks a hashed token across restarts until database revocation succeeds", () => {
    const directory = mkdtempSync(join(tmpdir(), "password-manager-revocation-test-"));
    try {
      const raw = "public-test-cookie"; const hash = createHash("sha256").update(raw).digest("hex");
      const original = new RevocationBarrier(directory); original.block(hash);
      expect(original.denied(hash)).toBe(true);
      expect(readFileSync(join(directory, "pending-revocations.json"), "utf8")).not.toContain(raw);
      const restarted = new RevocationBarrier(directory); expect(restarted.denied(hash)).toBe(true);
      restarted.complete(hash); expect(new RevocationBarrier(directory).denied(hash)).toBe(false);
    } finally { unlinkSync(join(directory, "pending-revocations.json")); rmdirSync(directory); }
  });
});
