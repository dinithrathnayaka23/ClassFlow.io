import type { NextConfig } from "next";

// The backend origin. Not a secret, and it has a working local default so the
// client runs with no environment file of its own - backend/.env stays the only
// .env in the project.
const backendOrigin = process.env.BACKEND_ORIGIN ?? "http://localhost:8080";

const nextConfig: NextConfig = {
  images: { remotePatterns: [] },
  turbopack: { root: process.cwd() },
  // Proxy the API through the Next server so browser requests stay same-origin.
  // That keeps the HTTP-only auth cookie working without CORS or SameSite issues,
  // and means NEXT_PUBLIC_API_URL does not need to be set for local development.
  async rewrites() {
    return [
      { source: "/api/:path*", destination: `${backendOrigin}/api/:path*` },
      { source: "/uploads/:path*", destination: `${backendOrigin}/uploads/:path*` },
    ];
  },
};

export default nextConfig;
