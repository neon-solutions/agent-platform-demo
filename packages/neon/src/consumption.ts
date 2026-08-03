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
 *
 * Returns the response untouched: nested periods, raw units (CU-seconds,
 * byte-hours). Shaping and unit conversion belong at the display edge, so
 * one fetch can feed a chart, a breakdown, and a cost estimate.
 */
export async function getProjectsConsumption(
  plan: Plan,
  projectIds: string[],
  from: string,
  to: string,
  granularity: "hourly" | "daily" | "monthly" = "daily",
): Promise<unknown[]> {
  if (projectIds.length === 0) {
    return [];
  }
  const creds = tenantCreds(plan);
  const sdk = neonClientFor(creds);
  const { data, error } = await sdk.consumption
    .perProjectV2({
      org_id: creds.orgId,
      from,
      to,
      granularity,
      metrics: [...CONSUMPTION_METRICS],
      project_ids: projectIds,
    })
    .all();
  if (error) {
    throw error;
  }
  return data;
}

/** One project's consumption; the single-tenant case of the above. */
export function getProjectConsumption(
  plan: Plan,
  projectId: string,
  from: string,
  to: string,
  granularity: "hourly" | "daily" | "monthly" = "daily",
): Promise<unknown[]> {
  return getProjectsConsumption(plan, [projectId], from, to, granularity);
}
