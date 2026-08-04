import { neonClientFor, type Plan, tenantCreds } from "./client";

/**
 * Every billing-aligned v2 metric. A metric left out of the request is
 * absent from the response, and a cost estimate built on it silently bills
 * nothing for that line — so the default is all of them.
 */
export const CONSUMPTION_METRICS = [
  "compute_unit_seconds",
  "root_branch_bytes_month",
  "child_branch_bytes_month",
  "instant_restore_bytes_month",
  "snapshot_storage_bytes_month",
  "public_network_transfer_bytes",
  "private_network_transfer_bytes",
  "extra_branches_month",
] as const;

export type ConsumptionMetric = (typeof CONSUMPTION_METRICS)[number];

/** The v2 endpoint filters on at most 100 project ids per request. */
const MAX_PROJECT_IDS = 100;

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
  metrics: readonly ConsumptionMetric[] = CONSUMPTION_METRICS,
): Promise<unknown[]> {
  if (projectIds.length === 0) {
    return [];
  }
  const creds = tenantCreds(plan);
  const sdk = neonClientFor(creds);
  const batches: string[][] = [];
  for (let index = 0; index < projectIds.length; index += MAX_PROJECT_IDS) {
    batches.push(projectIds.slice(index, index + MAX_PROJECT_IDS));
  }

  const pages = await Promise.all(
    batches.map(async (batch) => {
      const { data, error } = await sdk.consumption
        .perProjectV2({
          org_id: creds.orgId,
          from,
          to,
          granularity,
          metrics: [...metrics],
          project_ids: batch,
        })
        .all();
      if (error) {
        throw error;
      }
      return data;
    }),
  );

  return pages.flat();
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
