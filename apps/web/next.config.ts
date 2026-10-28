import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  images: {
    // Only public product screenshots are eligible for server-side optimization.
    // Account/vault routes, arbitrary URLs and query-bearing sources are excluded.
    localPatterns: [{ pathname: "/images/product/**", search: "" }],
    qualities: [85],
  },
  async headers() {
    return [{ source: "/:path*", headers: [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "no-referrer" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }] : []),
    ] }];
  },
  turbopack: {
    root: path.join(__dirname, "../.."), // points to monorepo root
  }
  
};

export default nextConfig;
