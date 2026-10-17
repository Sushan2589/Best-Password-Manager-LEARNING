export function emailConfig(env: Record<string, string | undefined> = process.env) {
  const production = env.NODE_ENV === "production";
  const from = env.EMAIL_FROM || (production ? "" : "onboarding@resend.dev");
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(from) || /[\r\n]/.test(from)) throw new Error("EMAIL_FROM must be a valid sender email address.");
  if (production && (from.toLowerCase().endsWith("@resend.dev") || !env.RESEND_API_KEY)) throw new Error("Production email requires RESEND_API_KEY and EMAIL_FROM on your verified sending domain.");
  return { from };
}
