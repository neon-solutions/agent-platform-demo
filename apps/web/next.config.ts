import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source; Next compiles them in-place.
  transpilePackages: ["@vibe/api", "@vibe/auth", "@vibe/db", "@vibe/env", "@vibe/ui"],
};

export default nextConfig;
