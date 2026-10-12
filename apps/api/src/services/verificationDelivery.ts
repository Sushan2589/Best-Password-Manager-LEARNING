import { sendVerificationEmail } from "./email.js";
import { securityLog } from "./securityLog.js";

let active = 0;
// Do not make the public registration response wait on a real recipient's mail
// delivery, which otherwise distinguishes existing accounts through timing.
// Bounded, best-effort memory-only delivery; authenticated resend is the retry.
export function deliverRegistrationVerification(email: string, token: string) {
  if (active >= 2) { securityLog("operation_failed"); return; }
  active++;
  void Promise.resolve().then(() => sendVerificationEmail(email, token))
    .catch(() => securityLog("operation_failed"))
    .finally(() => { active--; });
}
