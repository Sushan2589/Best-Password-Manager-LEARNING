import { Resend } from 'resend';
import { SECURITY } from '../config/security.js';

const resend = new Resend(process.env.RESEND_API_KEY as string);

export async function sendVerificationEmail(
  email: string,
  token: string
) {
  const { error } = await resend.emails.send({
  from: 'onboarding@resend.dev',
  to: email,
  subject: 'Verify your email',
  html: `
  <p>Please click the link to verify your email:</p>
  <a href="${SECURITY.webOrigin}/verify-email?token=${encodeURIComponent(token)}">
    Verify Email
  </a>
`,
});
  if (error) throw new Error('Verification email delivery failed.');
}
