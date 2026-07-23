import { type Plan, tenantClient } from "./client";

/** Snapshot a tenant branch (the "data" half of a checkpoint). */
export async function snapshotTenantBranch(
  plan: Plan,
  projectId: string,
  branchId: string,
  label: string,
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
  targetBranchId: string,
): Promise<void> {
  const sdk = tenantClient(plan);
  await sdk.snapshots.restore(projectId, snapshotId, {
    targetBranchId,
    finalize: true,
  });
}
