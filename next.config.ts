import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Mastra agent + its heavy deps live in `functions/` and are deployed
  // separately to Neon Functions — never bundle them into the Next.js app.
  outputFileTracingExcludes: {
    "*": ["./functions/**"],
  },
  serverExternalPackages: ["@neon/sdk", "pg"],
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: false },
};

export default nextConfig;
