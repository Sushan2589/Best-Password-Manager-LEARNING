import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY as string);

export async function sendVerificationEmail(
  email: string,
  token: string
) {
  await resend.emails.send({
  from: 'onboarding@resend.dev',
  to: email,
  subject: 'Verify your email',
  html: `
  <p>Please click the link to verify your email:</p>
  <a href="http://localhost:3000/verify-email?token=${token}">
    Verify Email
  </a>
`,
});
}