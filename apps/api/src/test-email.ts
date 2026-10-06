import { sendVerificationEmail } from "./services/email.js";

await sendVerificationEmail(
  "sushandahal06@gmail.com",
  "test-token-123"
);

console.log("Email sent");