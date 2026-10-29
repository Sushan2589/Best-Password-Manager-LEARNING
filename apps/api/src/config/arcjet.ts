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
  // Credential prefixes can change. Validate a bounded, header-safe token here;
  // Arcjet remains responsible for authenticating it (provider errors fail closed).
  if (!key || !/^[A-Za-z0-9_-]{16,512}$/.test(key)) throw new Error("Set ARCJET_KEY to the server-only key copied from Arcjet, without quotes or whitespace.");
  if (!identityKey || !/^[a-fA-F0-9]{64}$/.test(identityKey)) throw new Error("ARCJET_IDENTITY_KEY must be a server-only random 32-byte hex key.");
  return { mode: mode as Exclude<ArcjetMode, "OFF">, key, identityKey };
}
