// types.ts
import type { DistributedRateLimiter } from "./services/arcjet.js";
export type Variables = {
  arcjetLimiter?: DistributedRateLimiter;
  userId: string;
  sessionExpiresAt: string;
  sessionId: string;
  sessionVersion: number;
  mfaVerifiedAt: string | null;
};
