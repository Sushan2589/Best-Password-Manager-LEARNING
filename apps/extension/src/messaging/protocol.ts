export const CONNECTION_CHECK = "connection/check";

export type ConnectionResult =
  | { ok: true; state: "reachable" | "no-session" | "restricted" }
  | { ok: false; error: "unavailable" | "timeout" | "invalid-response" | "forbidden" };

export function isConnectionRequest(value: unknown): boolean {
  return typeof value === "object" && value !== null &&
    Object.keys(value).length === 1 && "type" in value && value.type === CONNECTION_CHECK;
}

export function isConnectionResult(value: unknown): value is ConnectionResult {
  if (typeof value !== "object" || value === null || Object.keys(value).length !== 2 || !("ok" in value)) return false;
  if (value.ok === true && "state" in value) {
    return typeof value.state === "string" && ["reachable", "no-session", "restricted"].includes(value.state);
  }
  if (value.ok === false && "error" in value) {
    return typeof value.error === "string" && ["unavailable", "timeout", "invalid-response", "forbidden"].includes(value.error);
  }
  return false;
}
