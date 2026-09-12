import type { NextConfig } from "next";
import path from "path/win32";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.join(__dirname, "../.."), // points to monorepo root
  }
  
};

export default nextConfig;
