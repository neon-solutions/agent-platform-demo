import { defineConfig } from "@neon/config/v1";

/**
 * Neon infrastructure-as-code for the control-plane project.
 *
 * The control project hosts three things that branch together:
 *   - Postgres      → Better Auth + platform source of truth (packages/db)
 *   - AI Gateway    → one credential for every model the coding agent calls
 *   - the `agent`   → the Mastra coding agent, a long-running Neon Function
 *                     that vibe-codes apps into Vercel Sandboxes.
 *
 * Deploy the function + gateway with `neon deploy --env .env` (run from this
 * directory, or via the root `agent:deploy` script).
 */
export default defineConfig({
  preview: {
    aiGateway: true,
    functions: {
      agent: {
        name: "coding agent",
        source: "src/index.ts",
        env: {
          // Public base URL of the control app — the agent verifies the
          // caller's Better Auth JWT against `${AUTH_BASE_URL}/api/auth/jwks`.
          AUTH_BASE_URL: process.env.AGENT_AUTH_BASE_URL ?? process.env.BETTER_AUTH_URL!,
          // Gateway model override — accounts in the AI Gateway beta may not
          // have the default claude model enabled.
          AGENT_MODEL: process.env.AGENT_MODEL ?? "neon/claude-sonnet-4-6",
          // Org-scoped Neon keys so the agent can snapshot/restore the tenant
          // database that backs each vibe-coded app.
          NEON_FREE_API_KEY: process.env.NEON_FREE_API_KEY!,
          NEON_PAID_API_KEY: process.env.NEON_PAID_API_KEY!,
          NEON_FREE_ORG_ID: process.env.NEON_FREE_ORG_ID!,
          NEON_PAID_ORG_ID: process.env.NEON_PAID_ORG_ID!,
          // Vercel Sandbox control (build & serve the generated apps).
          VERCEL_TOKEN: process.env.VERCEL_TOKEN!,
          VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID!,
          VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID!,
        },
      },
    },
  },
});
