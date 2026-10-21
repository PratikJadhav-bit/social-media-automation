import type { NextConfig } from "next";
const config: NextConfig = {
  serverExternalPackages: ["better-sqlite3", "ffmpeg-static"],
  turbopack: { root: process.cwd() },
  outputFileTracingIncludes: {
    "/api/**": [
      "./vendor/**/skills/**/*",
      "./vendor/*/LICENSE",
      "./scripts/**/*",
    ],
  },
  outputFileTracingExcludes: { "/*": ["./data/**/*", "./tests/**/*"] },
};
export default config;
