import "dotenv/config";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

function getVercelOrigin() {
  const vercelUrl =
    process.env.VERCEL_ENV === "production"
      ? (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL)
      : (process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL);
  if (!vercelUrl) return undefined;
  return vercelUrl.startsWith("http") ? vercelUrl : `https://${vercelUrl}`;
}

const vercelOrigin = getVercelOrigin();

const runtimeEnv = {
  ...process.env,
  BETTER_AUTH_URL: process.env.BETTER_AUTH_URL ?? vercelOrigin,
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? process.env.BETTER_AUTH_URL ?? vercelOrigin,
};

export const env = createEnv({
  server: {
    DATABASE_URL: z.string().min(1),
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url(),
    CORS_ORIGIN: z.url(),
    NODE_ENV: z.enum(["development", "production", "test"]).default("development"),

    // Neon control plane (@neon/sdk)
    NEON_CONTROL_API_KEY: z.string().min(1),
    NEON_CONTROL_ORG_ID: z.string().min(1),
    NEON_CONTROL_PROJECT_ID: z.string().min(1),
    // Personal key: required for cross-org project transfer on upgrade.
    NEON_PERSONAL_API_KEY: z.string().min(1),

    // Tenant orgs (the databases behind every vibe-coded app)
    NEON_FREE_ORG_ID: z.string().min(1),
    NEON_FREE_API_KEY: z.string().min(1),
    NEON_PAID_ORG_ID: z.string().min(1),
    NEON_PAID_API_KEY: z.string().min(1),

    // Vercel Sandboxes
    VERCEL_TOKEN: z.string().min(1),
    VERCEL_TEAM_ID: z.string().min(1),
    VERCEL_PROJECT_ID: z.string().min(1),
  },
  runtimeEnv: runtimeEnv,
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
