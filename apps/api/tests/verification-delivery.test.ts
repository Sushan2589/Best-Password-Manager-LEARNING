import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ send: vi.fn(), waitUntil: vi.fn() }));
vi.mock("../src/services/email.js", () => ({ sendVerificationEmail: mocks.send }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
import { deliverRegistrationVerification } from "../src/services/verificationDelivery.js";

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
describe("verification email function lifetime", () => {
  it("registers delivery with Vercel without delaying the registration response", async () => {
    vi.stubEnv("VERCEL", "1");
    let finish!: () => void;
    mocks.send.mockImplementation(() => new Promise<void>(resolve => { finish = resolve; }));
    expect(deliverRegistrationVerification("fixture@example.com", "public-token")).toBeUndefined();
    expect(mocks.waitUntil).toHaveBeenCalledOnce();
    await Promise.resolve();
    finish();
    await mocks.waitUntil.mock.calls[0]![0];
  });
  it("handles email failures without unhandled rejections or leaking provider errors", async () => {
    vi.stubEnv("VERCEL", "1");
    mocks.send.mockRejectedValue(new Error("private-provider-details"));
    deliverRegistrationVerification("fixture@example.com", "public-token");
    await expect(mocks.waitUntil.mock.calls[0]![0]).resolves.toBeUndefined();
  });
});
