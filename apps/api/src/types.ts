// types.ts
export type Variables = {
  userId: string;
  sessionExpiresAt: string;
  sessionId: string;
  sessionVersion: number;
  mfaVerifiedAt: string | null;
};
