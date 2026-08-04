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
  estimateFleetCost,
  hoursBetween,
  METRIC_COLORS,
  METRIC_LABELS,
  STORAGE_METRICS,
  toAverageBytes,
  toBillingUnit,
} from "@/lib/consumption";
import { hasMeteredData, NOT_METERED } from "@/lib/usage";
import { orpc } from "@/utils/orpc";

/**
 * Each granularity reaches back only so far, so the window is sized to the
 * one being requested. Hourly stops one hour short of its 168-hour ceiling
 * because Neon rounds `from` down to the hour, which would push a full 168
 * past the limit and answer 406.
 */
const WINDOW_HOURS: Record<ConsumptionGranularityOption, number> = {
  daily: 14 * 24,
  hourly: 167,
  monthly: 365 * 24,
};
const HOUR_MS = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;

/**
 * Tenant apps sit in Neon's agent-plan orgs, so that is the rate card the
 * estimate has to use. Reading it off the demo's own plan would quote the
 * user a price nobody charges.
 */
const RATE_PLAN = "agent" as const;

/**
 * The allowances are monthly and this window is a rolling fortnight, so the
 * card has to say what it is: a rate card applied to a window. An invoice
 * counts a billing period, and one that started before this window did has
 * already spent part of the allowance shown here.
 */
const COST_NOTE =
  "estimate · agent rates over this window, not a billing period — allowances reset monthly, and the invoice is the source of truth";

/** Metrics worth plotting over time; storage gets its own breakdown. */
const CHART_METRICS: ConsumptionMetricName[] = [
  "compute_unit_seconds",
  "root_branch_bytes_month",
  "child_branch_bytes_month",
  "snapshot_storage_bytes_month",
];

const NUMBER = new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 });

/**
 * "Feb 4" from a bucket's RFC 3339 start. Day and month boundaries are UTC
 * ones, so they are labelled in UTC: west of Greenwich a local format names
 * the day before the one the bucket covers.
 */
function bucketLabel(start: string, granularity: ConsumptionGranularityOption): string {
  const date = new Date(start);
  if (granularity === "hourly") {
    return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  }
  if (granularity === "monthly") {
    return date.toLocaleDateString(undefined, {
      month: "short",
      timeZone: "UTC",
      year: "numeric",
    });
  }
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

/** One metric's samples as UsageCard points, in native units. */
function samples(
  buckets: ConsumptionBucket[],
  metric: ConsumptionMetricName,
  granularity: ConsumptionGranularityOption,
) {
  return buckets.map((bucket) => ({
    label: bucketLabel(bucket.start, granularity),
    value: bucket.values[metric] ?? 0,
  }));
}

/**
 * Storage as bytes actually held, per bucket.
 *
 * The storage metrics are byte-hours — an accumulation, not a level. A day
 * of holding 1 GB arrives as 24 GB-hours, so handing the raw value to a card
 * that formats bytes claims 24 GB of data.
 */
function storageSamples(
  buckets: ConsumptionBucket[],
  granularity: ConsumptionGranularityOption,
) {
  return buckets.map((bucket) => {
    const byteHours = STORAGE_METRICS.reduce(
      (sum, metric) => sum + (bucket.values[metric] ?? 0),
      0,
    );

    return {
      label: bucketLabel(bucket.start, granularity),
      value: toAverageBytes(byteHours, hoursBetween(bucket.start, bucket.end)),
    };
  });
}

export default function UsagePage() {
  const [granularity, setGranularity] = useState<ConsumptionGranularityOption>("daily");

  // The window is stable across renders: a fresh Date on every render would
  // change the hook's request key and refetch forever. It does move when the
  // granularity does, because each one reaches back a different distance.
  const windowHours = WINDOW_HOURS[granularity];
  const { from, to } = useMemo(() => {
    const end = new Date();
    return {
      from: new Date(end.getTime() - windowHours * HOUR_MS).toISOString(),
      to: end.toISOString(),
    };
  }, [windowHours]);

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

  // Per project, then summed: allowances are granted per project, so a fleet
  // total run through one allowance bills traffic nobody is charged for.
  const cost = estimateFleetCost(
    holders.map((holder) => holder.totals),
    RATE_PLAN,
    { hoursInPeriod: hoursBetween(from, to) },
  );

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
  // Zeros are a claim. Until Neon has actually metered something, say so
  // once instead of printing "0" five times in five different shapes.
  const metered = hasMeteredData(buckets);
  // A failed first fetch is not an unmetered account. Render the cards so
  // they can carry the error, rather than reporting the outage as a fact
  // about the usage.
  const showFigures = loading || metered || error !== null;
  // The app list failing is the one case where there is nothing to render a
  // card around, so it has to be said here instead.
  const appsError = prototypes.error
    ? `${prototypes.error.message} Reload to try again.`
    : null;
  const emptyState = hasApps
    ? NOT_METERED
    : {
        description: "Usage appears here once an app has a database behind it.",
        title: "No apps yet",
      };

  return (
    <div className="flex min-h-svh flex-col">
      <TopNav>
        <span className="text-muted-foreground text-sm">/ Usage</span>
      </TopNav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <header className="mb-6">
          <h1 className="font-semibold text-2xl tracking-tight">Usage</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Metered straight from Neon, across every app on your account.{" "}
            <span className="text-muted-foreground/70">
              Last {Math.round(windowHours / HOURS_PER_DAY)} days · {period}
            </span>
          </p>
        </header>

        {hasApps && showFigures ? (
          <div className="space-y-6">
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <UsageCard
                data={samples(buckets, "compute_unit_seconds", granularity)}
                error={error}
                isLoading={loading}
                metric="compute"
              />
              <UsageCard
                data={storageSamples(buckets, granularity)}
                error={error}
                isLoading={loading}
                label="Storage"
                metric="storage"
              />
              <UsageCard
                data={samples(buckets, "public_network_transfer_bytes", granularity)}
                error={error}
                isLoading={loading}
                label="Data out"
                metric="written-data"
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
                note={COST_NOTE}
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
            description={appsError ?? emptyState.description}
            title={appsError ? "Could not load your apps" : emptyState.title}
          />
        )}
      </main>
    </div>
  );
}
