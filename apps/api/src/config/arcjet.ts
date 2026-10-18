export type ArcjetMode = "LIVE" | "DRY_RUN" | "OFF";

export function arcjetConfig(env: Record<string, string | undefined> = process.env) {
  const production = env.NODE_ENV === "production";
  const mode = env.ARCJET_MODE ?? (production ? "LIVE" : "OFF");
  if (!["LIVE", "DRY_RUN", "OFF"].includes(mode)) throw new Error("ARCJET_MODE must be LIVE, DRY_RUN or OFF.");
  if (production && (mode !== "LIVE" || env.ARCJET_ENV === "development")) {
    throw new Error("Production requires ARCJET_MODE=LIVE and must not use ARCJET_ENV=development.");
  }
  if (mode === "OFF") return { mode: "OFF" as const };
  const key = env.ARCJET_KEY;
  const identityKey = env.ARCJET_IDENTITY_KEY;
  if (!key || !/^ajkey_[A-Za-z0-9_-]+$/.test(key)) throw new Error("Set a valid server-only ARCJET_KEY.");
  if (!identityKey || !/^[a-fA-F0-9]{64}$/.test(identityKey)) throw new Error("ARCJET_IDENTITY_KEY must be a server-only random 32-byte hex key.");
  return { mode: mode as Exclude<ArcjetMode, "OFF">, key, identityKey };
}
