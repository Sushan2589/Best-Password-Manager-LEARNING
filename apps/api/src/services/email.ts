import { Resend } from 'resend';
import { SECURITY } from '../config/security.js';
import { emailConfig } from '../config/email.js';

const { from } = emailConfig();
const resend = new Resend(process.env.RESEND_API_KEY as string);

export async function sendVerificationEmail(
  email: string,
  token: string
) {
  const { error } = await resend.emails.send({
  from,
  to: email,
  subject: 'Verify your email',
  html: `
  <p>Please click the link to verify your email:</p>
  <a href="${SECURITY.webOrigin}/verify-email#token=${encodeURIComponent(token)}">
    Verify Email
  </a>
`,
}, { signal: AbortSignal.timeout(10000) });
  if (error) throw new Error('Verification email delivery failed.');
}

export async function sendSecurityNotice(email: string) {
  const { error } = await resend.emails.send({ from, to: email,
    subject: "Password Manager security change",
    html: `<p>An account security change was requested or completed. If this was not you, sign in and revoke other sessions immediately.</p><a href="${SECURITY.webOrigin}/account">Review account security</a>` }, { signal: AbortSignal.timeout(10000) });
  if (error) throw new Error("Security notification delivery failed.");
}
