"use client";

import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";

import { BranchUsageTable } from "@/components/branch-usage-table/branch-usage-table";
import {
  type ConsumptionGranularityOption,
  ConsumptionChart,
} from "@/components/consumption-chart/consumption-chart";
import { CostEstimateCard } from "@/components/cost-estimate-card/cost-estimate-card";
import { EmptyState } from "@/components/empty-state/empty-state";
import { StorageBreakdown } from "@/components/storage-breakdown/storage-breakdown";
import { TopNav } from "@/components/top-nav";
import { UsageCard } from "@/components/usage-card/usage-card";
import { useConsumptionHistory } from "@/hooks/use-consumption-history";
import {
  type ConsumptionBucket,
  type ConsumptionMetricName,
  estimateCost,
  hoursBetween,
  METRIC_COLORS,
  METRIC_LABELS,
  STORAGE_METRICS,
  toBillingUnit,
} from "@/lib/consumption";
import { orpc } from "@/utils/orpc";

const WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Tenant apps sit in Neon's agent-plan orgs, so that is the rate card the
 * estimate has to use. Reading it off the demo's own plan would quote the
 * user a price nobody charges.
 */
const RATE_PLAN = "agent" as const;

/** Metrics worth plotting over time; storage gets its own breakdown. */
const CHART_METRICS: ConsumptionMetricName[] = [
  "compute_unit_seconds",
  "root_branch_bytes_month",
  "child_branch_bytes_month",
  "snapshot_storage_bytes_month",
];

const NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/** "Feb 4" from a bucket's RFC 3339 start. */
function bucketLabel(start: string, granularity: ConsumptionGranularityOption): string {
  const date = new Date(start);
  if (granularity === "hourly") {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (granularity === "monthly") {
    return date.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  }
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

/** One metric's samples as UsageCard points, in native units. */
function samples(buckets: ConsumptionBucket[], metric: ConsumptionMetricName) {
  return buckets.map((bucket) => ({
    label: bucketLabel(bucket.start, "daily"),
    value: bucket.values[metric] ?? 0,
  }));
}

export default function UsagePage() {
  const [granularity, setGranularity] = useState<ConsumptionGranularityOption>("daily");

  // The window is stable across renders: a fresh Date on every render would
  // change the hook's request key and refetch forever.
  const { from, to } = useMemo(() => {
    const end = new Date();
    return {
      from: new Date(end.getTime() - WINDOW_DAYS * DAY_MS).toISOString(),
      to: end.toISOString(),
    };
  }, []);

  const prototypes = useQuery(orpc.prototypes.list.queryOptions());
  const apps = prototypes.data ?? [];
  const provisioned = apps.filter((app) => app.neonProjectId);

  const { buckets, totals, holders, isLoading, error, updatedAt } = useConsumptionHistory({
    enabled: provisioned.length > 0,
    from,
    granularity,
    to,
  });

  const loading = prototypes.isLoading || isLoading;
  const period = `${new Date(from).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
  })} – ${new Date(to).toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;

  const chartData = buckets.map((bucket) => ({
    label: bucketLabel(bucket.start, granularity),
    values: Object.fromEntries(
      CHART_METRICS.map((metric) => [metric, toBillingUnit(metric, bucket.values[metric] ?? 0)]),
    ),
  }));

  const cost = estimateCost(totals, RATE_PLAN, {
    hoursInPeriod: hoursBetween(from, to),
  });

  const storage = STORAGE_METRICS.map((metric) => ({
    color: METRIC_COLORS[metric],
    id: metric,
    label: METRIC_LABELS[metric],
    rate: cost.items.find((item) => item.id === metric)?.rate,
    value: toBillingUnit(metric, totals[metric] ?? 0),
  })).filter((segment) => segment.value > 0);

  /**
   * One row per app, not per branch: every app IS one Neon project with one
   * branch, so the project is the unit a user recognises. The table reads
   * the same either way — it ranks named things by metric.
   */
  const rows = provisioned.map((app) => {
    const holder = holders.find((entry) => entry.id === app.neonProjectId);

    return {
      hint: app.plan === "paid" ? "paid plan" : "free plan",
      id: app.neonProjectId ?? app.id,
      metrics: Object.fromEntries(
        CHART_METRICS.map((metric) => [metric, toBillingUnit(metric, holder?.totals[metric] ?? 0)]),
      ),
      name: app.name,
    };
  });

  // Apps load client-side, so the first paint has none. Treat "still
  // loading" as having apps: the cards render their own skeletons, and the
  // empty state only speaks once we know there is nothing to meter.
  const hasApps = provisioned.length > 0 || prototypes.isLoading;

  return (
    <div className="flex min-h-svh flex-col">
      <TopNav>
        <span className="text-muted-foreground text-sm">/ Usage</span>
      </TopNav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <header className="mb-6">
          <h1 className="font-semibold text-2xl tracking-tight">Usage</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Metered straight from Neon, across every app on your account.
          </p>
        </header>

        {hasApps ? (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UsageCard
                data={samples(buckets, "compute_unit_seconds")}
                error={error}
                isLoading={loading}
                metric="compute"
                windowLabel={`${WINDOW_DAYS}d`}
              />
              <UsageCard
                data={samples(buckets, "root_branch_bytes_month")}
                error={error}
                isLoading={loading}
                label="Storage"
                metric="storage"
                windowLabel={`${WINDOW_DAYS}d`}
              />
              <UsageCard
                data={samples(buckets, "public_network_transfer_bytes")}
                error={error}
                isLoading={loading}
                label="Data out"
                metric="written-data"
                windowLabel={`${WINDOW_DAYS}d`}
              />
            </section>

            <ConsumptionChart
              data={chartData}
              error={error}
              formatValue={(value) => NUMBER.format(value)}
              granularities={["hourly", "daily"]}
              granularity={granularity}
              isLoading={loading}
              meteredThrough={
                updatedAt
                  ? `metered through ${updatedAt.toLocaleTimeString(undefined, {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}`
                  : undefined
              }
              onGranularityChange={setGranularity}
              series={CHART_METRICS.map((metric) => ({
                color: METRIC_COLORS[metric],
                id: metric,
                label: METRIC_LABELS[metric],
                unit: metric === "compute_unit_seconds" ? "CU-hr" : "GB-mo",
              }))}
              title="Consumption"
            />

            <div className="grid gap-6 lg:grid-cols-2">
              <StorageBreakdown
                error={error}
                isLoading={loading}
                period={period}
                segments={storage}
                title="Storage"
                unit="GB-mo"
              />
              <CostEstimateCard
                collapseZero
                error={error}
                isLoading={loading}
                lines={cost.items}
                period={period}
                plan="agent"
              />
            </div>

            <BranchUsageTable
              columns={CHART_METRICS.map((metric) => ({
                id: metric,
                label: METRIC_LABELS[metric],
                unit: metric === "compute_unit_seconds" ? "CU-hr" : "GB-mo",
              }))}
              error={error}
              isLoading={loading}
              rows={rows}
              showTotals
              title="By app"
              topN={10}
            />
          </div>
        ) : (
          <EmptyState
            description="Usage appears here once an app has a database behind it."
            title="Nothing metered yet"
          />
        )}
      </main>
    </div>
  );
}
