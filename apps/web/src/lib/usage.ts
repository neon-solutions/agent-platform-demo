import type { ConsumptionBucket } from "@/lib/consumption";

/**
 * Has Neon actually metered anything in this window?
 *
 * Neon meters roughly every 15 minutes and omits metrics that were zero,
 * so a freshly provisioned project returns buckets with nothing in them —
 * or no buckets at all. Rendering that as "0 hrs" claims a measurement
 * that was never taken. "We have no reading" and "we read zero" are
 * different facts, and only one of them is honest here.
 */
export function hasMeteredData(buckets: readonly ConsumptionBucket[]): boolean {
  return buckets.some((bucket) => Object.values(bucket.values).some((value) => (value ?? 0) > 0));
}

/** Copy for the not-yet-metered state, shared by every usage surface. */
export const NOT_METERED = {
  description:
    "Neon meters usage every few minutes. Numbers land here shortly after your app starts serving traffic.",
  title: "Nothing metered yet",
} as const;
