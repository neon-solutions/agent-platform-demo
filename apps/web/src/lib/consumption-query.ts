import { z } from "zod";

import {
  CONSUMPTION_METRICS,
  type ConsumptionGranularity,
  type ConsumptionMetricName,
  MAX_WINDOW_HOURS,
} from "./consumption";

const MS_PER_HOUR = 3_600_000;

/**
 * The browser sends a `to` of its own now, and its clock is not this
 * server's. One hour is the finest bucket the API meters, so a skew inside
 * it cannot make a request mean something different — and refusing it would
 * take the page down for anyone whose laptop runs fast.
 */
const CLOCK_SKEW_HOURS = 1;

/** A consumption request the proxy can act on, with defaults resolved. */
export interface ConsumptionQuery {
  from: string;
  to: string;
  granularity: ConsumptionGranularity;
  /** Null asks for every metric. */
  metrics: ConsumptionMetricName[] | null;
  /** Empty asks for the caller's whole fleet. */
  projectIds: string[];
}

export type ConsumptionQueryResult =
  | { ok: true; query: ConsumptionQuery }
  | { ok: false; error: string };

const csv = (value: string) =>
  value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);

/**
 * Neon's contract is RFC 3339, which `Date.parse` is looser than: it accepts
 * a bare `2026-08-01` and a handful of implementation-defined formats that
 * the API does not.
 */
const dateTime = z.iso.datetime({ offset: true });

const schema = z.object({
  from: dateTime,
  granularity: z.enum(["hourly", "daily", "monthly"]).default("daily"),
  metrics: z
    .string()
    .transform(csv)
    .pipe(z.array(z.enum(CONSUMPTION_METRICS)).nonempty())
    .optional(),
  project_ids: z.string().transform(csv).optional(),
  to: dateTime,
});

/**
 * Validates a consumption request before it reaches Neon.
 *
 * A range Neon cannot serve comes back as its 406, which a proxy can only
 * report as an upstream failure — naming neither the problem nor the fix.
 * Refusing it here says which limit was crossed and by how much. The limit
 * is a reach into the past, not a width: hourly serves the last 168 hours,
 * so an hour-long window from last year is as invalid as a year-long one.
 */
export const parseConsumptionQuery = (
  params: URLSearchParams,
  now: Date = new Date(),
): ConsumptionQueryResult => {
  const parsed = schema.safeParse(Object.fromEntries(params));

  if (!parsed.success) {
    return { error: z.prettifyError(parsed.error), ok: false };
  }

  const { from, granularity, metrics, project_ids, to } = parsed.data;
  const windowHours = (Date.parse(to) - Date.parse(from)) / MS_PER_HOUR;

  if (windowHours <= 0) {
    return { error: "from must be before to", ok: false };
  }

  const reach = MAX_WINDOW_HOURS[granularity];
  const ageHours = (now.getTime() - Date.parse(from)) / MS_PER_HOUR;

  if (ageHours > reach) {
    return {
      error: `${granularity} consumption reaches back ${reach} hours; from is ${Math.ceil(ageHours)} hours ago`,
      ok: false,
    };
  }

  const aheadHours = (Date.parse(to) - now.getTime()) / MS_PER_HOUR;

  if (aheadHours > CLOCK_SKEW_HOURS) {
    return {
      error: `to is ${Math.ceil(aheadHours)} hours in the future; nothing is metered past now`,
      ok: false,
    };
  }

  return {
    ok: true,
    query: {
      from,
      granularity,
      metrics: metrics ?? null,
      projectIds: project_ids ?? [],
      to,
    },
  };
};
