import type { NextConfig } from "next";
const config: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  async headers() {
    return [
      { source: "/:path*", headers: [{ key: "X-Content-Type-Options", value: "nosniff" }, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/f/:id", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *; object-src 'none'; base-uri 'self'" }] },
      { source: "/((?!f/).*)", headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" }, { key: "X-Frame-Options", value: "DENY" }] },
    ];
  },
};
export default config;
