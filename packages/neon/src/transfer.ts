import { createNeonClient } from "@neon/sdk";
import { requiredEnv } from "./client";

/**
 * The dual-org economics move: when a free-tier user upgrades, transfer their
 * Neon project from the sponsored free org to the paid org. This keeps all
 * their data + connection string and just moves the billing boundary.
 *
 * Cross-org transfer requires a PERSONAL API key (org keys are scoped to one
 * org). Projects with a Neon GitHub/Vercel integration can't transfer (422) —
 * ours have none.
 */
export async function transferProjectToPaid(projectId: string): Promise<string> {
  const fromOrgId = requiredEnv("NEON_FREE_ORG_ID");
  const toOrgId = requiredEnv("NEON_PAID_ORG_ID");
  const sdk = createNeonClient({
    apiKey: requiredEnv("NEON_PERSONAL_API_KEY"),
    orgId: fromOrgId,
    throwOnError: true,
    waitForReadiness: true,
  });
  await sdk.projects.transfer({ fromOrgId, toOrgId, projectIds: [projectId] });
  return toOrgId;
}
