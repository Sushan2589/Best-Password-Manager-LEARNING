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
  src: "./fonts/InterLatinVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  adjustFontFallback: false,
  variable: "--font-body-latin",
  declarations: [{ prop: "unicode-range", value: "U+0-FF,U+131,U+152-153,U+2BB-2BC,U+2C6,U+2DA,U+2DC,U+304,U+308,U+329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD" }],
});
const extendedBody = localFont({
  src: "./fonts/InterVariable.woff2",
  weight: "100 900",
  style: "normal",
  display: "swap",
  preload: false,
  variable: "--font-body-full",
  declarations: [{ prop: "unicode-range", value: "U+100-130,U+132-151,U+154-2BA,U+2BD-2C5,U+2C7-2D9,U+2DB,U+2DD-303,U+305-307,U+309-328,U+32A-1FFF,U+2070-20AB,U+20AD-2121,U+2123-2190,U+2192,U+2194-2211,U+2213-2214,U+2216-FEFE,U+FF00-FFFC,U+FFFE-10FFFF" }],
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
      className={`${display.variable} ${body.variable} ${extendedBody.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
