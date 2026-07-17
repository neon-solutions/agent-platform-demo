import { createNeonClient } from "@neon/sdk";

/**
 * Tenant tiers. Each vibe-coded app's database lives in one of two Neon orgs:
 * a free-plan org and a paid-plan org. The platform routes new apps by the
 * `plan` the user picked.
 */
export type Plan = "free" | "paid";

interface OrgCreds {
  orgId: string;
  apiKey: string;
}

function tenantCreds(plan: Plan): OrgCreds {
  if (plan === "paid") {
    return {
      orgId: required("NEON_PAID_ORG_ID"),
      apiKey: required("NEON_PAID_API_KEY"),
    };
  }
  return {
    orgId: required("NEON_FREE_ORG_ID"),
    apiKey: required("NEON_FREE_API_KEY"),
  };
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
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

export interface ProvisionedDb {
  plan: Plan;
  orgId: string;
  projectId: string;
  branchId: string;
  /** Pooled connection string for the app to use as DATABASE_URL. */
  databaseUrl: string;
}

const TENANT_REGION = "aws-us-east-2";

/**
 * Provision an isolated Neon Postgres project for one vibe-coded app.
 * Returns a ready-to-use pooled connection string.
 */
export async function provisionTenantDb(
  plan: Plan,
  name: string
): Promise<ProvisionedDb> {
  const creds = tenantCreds(plan);
  const sdk = neonClientFor(creds);

  const { project, connectionString } = await sdk.projects.createAndConnect({
    name,
    region_id: TENANT_REGION,
    pg_version: 17,
  });

  const listed = await sdk.branches.list(project.id).all();
  if (listed.error) throw listed.error;
  const branches = listed.data;
  const defaultBranch = branches.find((b) => b.default) ?? branches[0];
  if (!defaultBranch) throw new Error("provisioned project has no branch");

  return {
    plan,
    orgId: creds.orgId,
    projectId: project.id,
    branchId: defaultBranch.id,
    databaseUrl: connectionString,
  };
}

/** Snapshot a tenant branch (the "data" half of a checkpoint). */
export async function snapshotTenantBranch(
  plan: Plan,
  projectId: string,
  branchId: string,
  label: string
): Promise<string> {
  const sdk = tenantClient(plan);
  const snapshot = await sdk.snapshots.create(projectId, branchId, {
    name: label,
  });
  return snapshot.id;
}

/**
 * Restore a tenant branch to a previous snapshot (the "data" half of a
 * checkpoint restore). Restores onto the live branch and finalizes it so the
 * app's connection string keeps working.
 */
export async function restoreTenantSnapshot(
  plan: Plan,
  projectId: string,
  snapshotId: string,
  targetBranchId: string
): Promise<void> {
  const sdk = tenantClient(plan);
  await sdk.snapshots.restore(projectId, snapshotId, {
    targetBranchId,
    finalize: true,
  });
}

export async function deleteTenantProject(plan: Plan, projectId: string): Promise<void> {
  const sdk = tenantClient(plan);
  await sdk.projects.delete(projectId);
}

/**
 * Re-resolve a project's default branch + pooled connection string. Needed
 * after a finalized snapshot restore (Neon rotates the branch id) or an org
 * transfer, so the ledger and the app's DATABASE_URL stay correct.
 */
export async function resolveConnection(
  plan: Plan,
  projectId: string
): Promise<{ branchId: string; databaseUrl: string }> {
  const sdk = tenantClient(plan);
  const listed = await sdk.branches.list(projectId).all();
  if (listed.error) throw listed.error;
  const defaultBranch = listed.data.find((b) => b.default) ?? listed.data[0];
  if (!defaultBranch) throw new Error("project has no branch");
  const databaseUrl = await sdk.postgres.connectionString({
    projectId,
    branchId: defaultBranch.id,
    databaseName: "neondb",
    roleName: "neondb_owner",
    pooled: true,
  });
  return { branchId: defaultBranch.id, databaseUrl };
}

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
  const apiKey = required("NEON_PERSONAL_API_KEY");
  const fromOrgId = required("NEON_FREE_ORG_ID");
  const toOrgId = required("NEON_PAID_ORG_ID");
  const sdk = createNeonClient({ apiKey, orgId: fromOrgId, throwOnError: true, waitForReadiness: true });
  await sdk.projects.transfer({ fromOrgId, toOrgId, projectIds: [projectId] });
  return toOrgId;
}

/** Billing-aligned v2 metrics. */
export const CONSUMPTION_METRICS = [
  "compute_unit_seconds",
  "root_branch_bytes_month",
  "child_branch_bytes_month",
  "snapshot_storage_bytes_month",
  "public_network_transfer_bytes",
] as const;

export interface ProjectConsumption {
  periods: Array<{
    consumption: Array<Record<string, unknown>>;
  }>;
}

/**
 * Per-project, billing-aligned usage via the v2 consumption endpoint — the
 * metering surface a metered fleet bills from.
 */
export async function getProjectConsumption(
  plan: Plan,
  projectId: string,
  from: string,
  to: string,
  granularity: "hourly" | "daily" | "monthly" = "daily"
): Promise<unknown[]> {
  const creds = tenantCreds(plan);
  const sdk = neonClientFor(creds);
  const { data, error } = await sdk.consumption
    .perProjectV2({
      org_id: creds.orgId,
      from,
      to,
      granularity,
      metrics: [...CONSUMPTION_METRICS],
      project_ids: [projectId],
    })
    .all();
  if (error) throw error;
  return data;
}
