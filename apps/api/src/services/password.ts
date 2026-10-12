import argon2 from "argon2";
import { createHash } from "node:crypto";

// Public dummy hash of a random, discarded value; equal expensive work for
// unknown accounts. This is not a credential or an authentication bypass.
const DUMMY = "$argon2id$v=19$m=65536,p=4,t=3$iCZ1ut6DKZWk8WfNe2qcyw$SiOhfCfyiC4uozCSxMdVxOK+YKabUztIDBfa6XoB5po";
let active = 0;
export async function verifyPassword(hash: string | undefined, password: string) {
  if (active >= 2) throw new Error("AUTH_BUSY");
  active++;
  try { const result = await argon2.verify(hash ?? DUMMY, password); return !!hash && result; }
  finally { active--; }
}
export async function hashPassword(password: string) {
  if (active >= 2) throw new Error("AUTH_BUSY");
  active++;
  try { return await argon2.hash(password); } finally { active--; }
}
export async function passwordCompromised(password: string, request: typeof fetch = fetch) {
  const digest = createHash("sha1").update(password).digest("hex").toUpperCase();
  let response: Response;
  try { response = await request(`https://api.pwnedpasswords.com/range/${digest.slice(0, 5)}`, {
    headers: { "Add-Padding": "true" }, redirect: "error", signal: AbortSignal.timeout(5000),
  }); } catch { throw new Error("PASSWORD_CHECK_UNAVAILABLE"); }
  if (!response.ok) throw new Error("PASSWORD_CHECK_UNAVAILABLE");
  if (!response.body) throw new Error("PASSWORD_CHECK_UNAVAILABLE");
  const reader = response.body.getReader(); const decoder = new TextDecoder();
  let text = "", size = 0;
  try {
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 1_048_576) { await reader.cancel(); throw new Error(); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
  } catch { throw new Error("PASSWORD_CHECK_UNAVAILABLE"); }
  finally { reader.releaseLock(); }
  const lines = text.trim().split(/\r?\n/);
  if (!lines.length || lines.some(line => !/^[A-F0-9]{35}:\d+$/.test(line))) throw new Error("PASSWORD_CHECK_UNAVAILABLE");
  return lines.some(line => {
    const [suffix, count] = line.split(":"); return suffix === digest.slice(5) && Number(count) > 0;
  });
}
