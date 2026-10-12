import { randomUUID } from "node:crypto";
type Event = "auth_failure" | "auth_success" | "rate_limit" | "session_revocation_failed" | "operation_failed";
const windows = new Map<Event, { at: number; count: number }>();
export function securityLog(event: Event) {
  const now = Date.now(); let window = windows.get(event);
  if (!window || now - window.at >= 60_000) { window = { at: now, count: 0 }; windows.set(event, window); }
  if (++window.count <= 10) console.warn(JSON.stringify({ event, id: randomUUID(), time: new Date(now).toISOString() }));
  // No payloads, identities, cookies, token URLs, hashes or exception messages.
}
