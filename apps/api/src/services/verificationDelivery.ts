import { sendVerificationEmail } from "./email.js";
import { securityLog } from "./securityLog.js";
import { waitUntil } from "@vercel/functions";

let active = 0;
// Do not make the public registration response wait on a real recipient's mail
// delivery, which otherwise distinguishes existing accounts through timing.
// Bounded, best-effort memory-only delivery; authenticated resend is the retry.
export function deliverRegistrationVerification(email: string, token: string) {
  if (active >= 2) { securityLog("operation_failed"); return; }
  active++;
  const delivery = Promise.resolve().then(() => sendVerificationEmail(email, token))
    .catch(() => securityLog("operation_failed"))
    .finally(() => { active--; });
  // Keep the invocation alive after its 202 response. Delivery stays bounded
  // by Resend's timeout; authenticated resend remains the retry mechanism.
  if (process.env.VERCEL === "1") waitUntil(delivery);
}
