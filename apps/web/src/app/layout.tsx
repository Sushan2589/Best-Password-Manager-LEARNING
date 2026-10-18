import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { headers } from "next/headers";

const display = localFont({
  src: "./fonts/PlusJakartaSansVariable.woff2",
  weight: "200 800",
  style: "normal",
  display: "swap",
  variable: "--font-display",
});
const body = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  variable: "--font-body",
});

export const metadata: Metadata = {
  title: { default: "Password Manager", template: "%s | Password Manager" },
  description: "A calmer home for your passwords. Encrypted vault storage, stronger passwords, and browser autofill for your everyday life.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Per-request rendering lets Next attach the proxy's nonce to hydration scripts.
  await headers();
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
