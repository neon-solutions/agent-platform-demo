import { createNeonClient } from "@neon/sdk";

/**
 * Reads process.env directly (not the validated @vibe/env schema) because
 * this package is shared with the agent Neon Function, which only receives
 * the tenant-org keys — not the full control-plane env.
 */
export function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(`${name} is not set`);
  }
  return v;
}

/**
 * Tenant tiers. Each vibe-coded app's database lives in one of two Neon orgs:
 * a free-plan org (sponsored) and a paid-plan org. The platform routes new
 * apps by the plan the user picked; upgrade is a cross-org transfer.
 */
export type Plan = "free" | "paid";

export interface OrgCreds {
  orgId: string;
  apiKey: string;
}

export function tenantCreds(plan: Plan): OrgCreds {
  if (plan === "paid") {
    return {
      orgId: requiredEnv("NEON_PAID_ORG_ID"),
      apiKey: requiredEnv("NEON_PAID_API_KEY"),
    };
  }
  return {
    orgId: requiredEnv("NEON_FREE_ORG_ID"),
    apiKey: requiredEnv("NEON_FREE_API_KEY"),
  };
}

/** A Neon control-plane client scoped to a single org. */
export function neonClientFor(creds: OrgCreds) {
  return createNeonClient({
    apiKey: creds.apiKey,
    orgId: creds.orgId,
    throwOnError: true,
    waitForReadiness: true,
  });
}

export function tenantClient(plan: Plan) {
  return neonClientFor(tenantCreds(plan));
}
