import type { Metadata } from "next";
// import {  Geist, Geist_Mono } from "next/font/google";
import { Plus_Jakarta_Sans, Inter } from "next/font/google";
import "./globals.css";
import { headers } from "next/headers";

const display = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-display",
});
const body = Inter({
  subsets: ["latin"],
  variable: "--font-body",
});

// const geistSans = Geist({
//   variable: "--font-geist-sans",
//   subsets: ["latin"],
// });

// const geistMono = Geist_Mono({
//   variable: "--font-geist-mono",
//   subsets: ["latin"],
// });

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
