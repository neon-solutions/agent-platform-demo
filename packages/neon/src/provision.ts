import type { ProjectQuota } from "@neon/sdk";
import { neonClientFor, type Plan, tenantClient, tenantCreds } from "./client";

export interface ProvisionedDb {
  plan: Plan;
  orgId: string;
  projectId: string;
  branchId: string;
  /** Pooled connection string for the app to use as DATABASE_URL. */
  databaseUrl: string;
}

const TENANT_REGION = "aws-us-east-2";
const TENANT_PG_VERSION = 17;
const MB = 1024 * 1024;

/**
 * Guard-rail consumption quota applied to every tenant database. The platform
 * hands a fresh Neon project to anyone who signs up, so per-branch storage
 * and egress are capped to keep the sponsored orgs from being abused.
 * A zero or absent quota means "unlimited", so explicit values are set.
 */
const TENANT_PROJECT_QUOTA: ProjectQuota = {
  logical_size_bytes: 100 * MB,
  data_transfer_bytes: 1000 * MB,
};

/**
 * Provision an isolated Neon Postgres project for one vibe-coded app.
 * Returns a ready-to-use pooled connection string.
 */
export async function provisionTenantDb(plan: Plan, name: string): Promise<ProvisionedDb> {
  const creds = tenantCreds(plan);
  const sdk = neonClientFor(creds);

  const { project, connectionString } = await sdk.projects.createAndConnect({
    name,
    region_id: TENANT_REGION,
    pg_version: TENANT_PG_VERSION,
    settings: { quota: TENANT_PROJECT_QUOTA },
  });

  const listed = await sdk.branches.list(project.id).all();
  if (listed.error) {
    throw listed.error;
  }
  const branches = listed.data;
  const defaultBranch = branches.find((b) => b.default) ?? branches[0];
  if (!defaultBranch) {
    throw new Error("provisioned project has no branch");
  }

  return {
    plan,
    orgId: creds.orgId,
    projectId: project.id,
    branchId: defaultBranch.id,
    databaseUrl: connectionString,
  };
}

/**
 * Re-resolve a project's default branch + pooled connection string. Needed
 * after a finalized snapshot restore (Neon rotates the branch id) or an org
 * transfer, so the ledger and the app's DATABASE_URL stay correct.
 */
export async function resolveConnection(
  plan: Plan,
  projectId: string,
): Promise<{ branchId: string; databaseUrl: string }> {
  const sdk = tenantClient(plan);
  const listed = await sdk.branches.list(projectId).all();
  if (listed.error) {
    throw listed.error;
  }
  const defaultBranch = listed.data.find((b) => b.default) ?? listed.data[0];
  if (!defaultBranch) {
    throw new Error("project has no branch");
  }
  const databaseUrl = await sdk.postgres.connectionString({
    projectId,
    branchId: defaultBranch.id,
    databaseName: "neondb",
    roleName: "neondb_owner",
    pooled: true,
  });
  return { branchId: defaultBranch.id, databaseUrl };
}

export async function deleteTenantProject(plan: Plan, projectId: string): Promise<void> {
  const sdk = tenantClient(plan);
  await sdk.projects.delete(projectId);
}
