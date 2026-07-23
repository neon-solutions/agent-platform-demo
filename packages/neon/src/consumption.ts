import { neonClientFor, type Plan, tenantCreds } from "./client";

/** Billing-aligned v2 metrics. */
export const CONSUMPTION_METRICS = [
  "compute_unit_seconds",
  "root_branch_bytes_month",
  "child_branch_bytes_month",
  "snapshot_storage_bytes_month",
  "public_network_transfer_bytes",
] as const;

/**
 * Per-project, billing-aligned usage via the v2 consumption endpoint — the
 * metering surface a metered fleet bills from.
 */
export async function getProjectConsumption(
  plan: Plan,
  projectId: string,
  from: string,
  to: string,
  granularity: "hourly" | "daily" | "monthly" = "daily",
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
  if (error) {
    throw error;
  }
  return data;
}
