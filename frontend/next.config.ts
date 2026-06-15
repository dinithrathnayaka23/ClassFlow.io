import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: { remotePatterns: [] },
  turbopack: { root: process.cwd() },
};

export default nextConfig;
