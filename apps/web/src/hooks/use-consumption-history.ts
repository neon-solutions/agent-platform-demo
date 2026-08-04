"use client";

import { useCallback, useEffect, useState } from "react";
import { z } from "zod";

import type {
  ConsumptionBucket,
  ConsumptionGranularity,
  ConsumptionMetricName,
  ConsumptionPeriod,
  ConsumptionTotals,
} from "@/lib/consumption";
import {
  CONSUMPTION_METRICS,
  flattenConsumption,
  mergeBuckets,
  sumBuckets,
} from "@/lib/consumption";

/**
 * Neon refreshes consumption roughly every 15 minutes and the endpoints
 * share a ~50 req/min bucket, so anything faster than this just burns
 * quota on numbers that haven't moved.
 */
export const MIN_POLL_INTERVAL_MS = 900_000;

export interface UseConsumptionHistoryOptions {
  /**
   * Your own route handler that proxies the Neon consumption API. The key
   * is server-only, so the browser must never call console.neon.tech
   * directly. Defaults to "/api/consumption".
   */
  endpoint?: string;
  /** RFC 3339 start of the window. */
  from: string;
  /** RFC 3339 end of the window. */
  to: string;
  granularity: ConsumptionGranularity;
  /** Defaults to every metric the v2 project endpoint returns. */
  metrics?: readonly ConsumptionMetricName[];
  /** Narrow to specific projects; omit for the whole org. */
  projectIds?: readonly string[];
  /** Re-fetch on an interval. Clamped to 15 minutes. */
  pollIntervalMs?: number;
  /** Set false to hold the request until you're ready. */
  enabled?: boolean;
}

/**
 * One holder (project or branch) with its own window, so a fleet view can
 * rank its members instead of only reporting the sum. Neon returns the
 * split; flattening it away is a loss the caller can't recover.
 */
export interface ConsumptionHolder {
  /** project_id or branch_id, whichever the response carried. */
  id: string;
  buckets: ConsumptionBucket[];
  totals: ConsumptionTotals;
}

export interface UseConsumptionHistoryResult {
  /** One entry per timeframe, oldest first, raw API units. */
  buckets: ConsumptionBucket[];
  /** Every metric summed across the window, raw API units. */
  totals: ConsumptionTotals;
  /** The untouched response, for per-project or per-branch splitting. */
  periods: ConsumptionPeriod[];
  /** The same data kept split by project (or branch), oldest first. */
  holders: ConsumptionHolder[];
  isLoading: boolean;
  error: string | null;
  /**
   * When the data on screen was last fetched successfully. Null while a
   * failure left nothing to show. Pair it with a metering-lag notice.
   */
  updatedAt: Date | null;
  refresh: () => void;
}

/**
 * The proxy hands back Neon's v2 body untouched, so this is that shape:
 * every field the API omits on an empty bucket stays optional. Metric names
 * are left as strings — Neon may add one, and a metric this module has no
 * label or rate for is dropped downstream rather than treated as a fault.
 */
const periodSchema = z.object({
  consumption: z
    .array(
      z.object({
        metrics: z
          .array(z.object({ metric_name: z.string(), value: z.number() }))
          .optional(),
        timeframe_end: z.string().optional(),
        timeframe_start: z.string().optional(),
      }),
    )
    .optional(),
  period_id: z.string().optional(),
  period_plan: z.string().optional(),
  period_start: z.string().optional(),
});

const responseSchema = z.object({
  branches: z
    .array(z.object({ branch_id: z.string(), periods: z.array(periodSchema) }))
    .optional(),
  projects: z
    .array(z.object({ project_id: z.string(), periods: z.array(periodSchema) }))
    .optional(),
});

type ConsumptionResponse = z.infer<typeof responseSchema>;

const buildQuery = (options: UseConsumptionHistoryOptions) => {
  const params = new URLSearchParams({
    from: options.from,
    granularity: options.granularity,
    metrics: (options.metrics ?? CONSUMPTION_METRICS).join(","),
    to: options.to,
  });

  if (options.projectIds?.length) {
    params.set("project_ids", options.projectIds.join(","));
  }

  return params.toString();
};

/** Both v2 shapes nest the same periods; take whichever key came back. */
const readHolders = (
  payload: ConsumptionResponse,
): { id: string; periods: ConsumptionPeriod[] }[] =>
  payload.projects?.map((project) => ({
    id: project.project_id,
    periods: project.periods,
  })) ??
  payload.branches?.map((branch) => ({
    id: branch.branch_id,
    periods: branch.periods,
  })) ??
  [];

/**
 * Fetches consumption history through your own proxy route and shapes it
 * for charts and cards: flat buckets, summed totals, and the raw periods.
 *
 * The values stay in raw API units (CU-seconds, byte-hours, branch-hours).
 * Convert at the display edge with `toBillingUnit` and friends so the same
 * numbers can feed a chart, a breakdown, and a cost estimate.
 */
export const useConsumptionHistory = (
  options: UseConsumptionHistoryOptions,
): UseConsumptionHistoryResult => {
  const { enabled = true, endpoint = "/api/consumption", pollIntervalMs } = options;

  /**
   * One state object, tagged with the request it answers. Loading is
   * derived from that tag rather than set at the top of the effect: no
   * render cascade, and no window where stale data shows without a
   * pending state on refetch.
   *
   * `query` is kept alongside the key so a failure can tell a refetch of
   * the same window from a switch to a different one.
   */
  const [settled, setSettled] = useState<{
    key: string;
    query: string;
    holders: { id: string; periods: ConsumptionPeriod[] }[];
    error: string | null;
    updatedAt: Date | null;
  } | null>(null);
  const [nonce, setNonce] = useState(0);

  const query = buildQuery(options);
  const requestKey = `${endpoint}?${query}#${nonce}`;

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let inFlight: AbortController | null = null;
    let unmounted = false;

    const load = async () => {
      // A poll that starts while the previous one is still open would
      // otherwise race it, and the loser could land last.
      inFlight?.abort();
      const controller = new AbortController();
      inFlight = controller;

      try {
        const response = await fetch(`${endpoint}?${query}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Consumption request failed (${response.status})`);
        }

        setSettled({
          error: null,
          holders: readHolders(responseSchema.parse(await response.json())),
          key: requestKey,
          query,
          updatedAt: new Date(),
        });
      } catch (error) {
        if (controller.signal.aborted || unmounted) {
          return;
        }

        // Keep the last good numbers on screen only when they answer the
        // same question; data fetched for another window or granularity
        // would be relabelled as this one's.
        setSettled((previous) => {
          const reusable = previous?.query === query ? previous : null;

          return {
            error: error instanceof Error ? error.message : "Request failed",
            holders: reusable?.holders ?? [],
            key: requestKey,
            query,
            updatedAt: reusable?.updatedAt ?? null,
          };
        });
      }
    };

    void load();

    const interval =
      pollIntervalMs === undefined
        ? null
        : window.setInterval(() => void load(), Math.max(pollIntervalMs, MIN_POLL_INTERVAL_MS));

    return () => {
      unmounted = true;
      inFlight?.abort();

      if (interval !== null) {
        window.clearInterval(interval);
      }
    };
  }, [enabled, endpoint, query, pollIntervalMs, requestKey]);

  const rawHolders = settled?.holders ?? [];
  const periods = rawHolders.flatMap((holder) => holder.periods);
  // Every holder reports the same timeframes, so the account series is the
  // sum per timeframe — not every holder's buckets laid end to end.
  const buckets = mergeBuckets(flattenConsumption(periods));
  const holders: ConsumptionHolder[] = rawHolders.map((holder) => {
    const holderBuckets = flattenConsumption(holder.periods);

    return {
      buckets: holderBuckets,
      id: holder.id,
      totals: sumBuckets(holderBuckets),
    };
  });

  return {
    buckets,
    error: settled?.error ?? null,
    holders,
    isLoading: enabled && settled?.key !== requestKey,
    periods,
    refresh,
    totals: sumBuckets(buckets),
    updatedAt: settled?.updatedAt ?? null,
  };
};
