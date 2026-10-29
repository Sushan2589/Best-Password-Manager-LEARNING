// types.ts
import type { DistributedRateLimiter } from "./services/arcjet.js";
export type Variables = {
  registrationAdmission?: (email: string) => Promise<Response | undefined>;
  arcjetLimiter?: DistributedRateLimiter;
  userId: string;
  sessionExpiresAt: string;
  sessionId: string;
  sessionVersion: number;
  mfaVerifiedAt: string | null;
};
