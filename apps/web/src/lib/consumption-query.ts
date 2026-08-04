import { z } from "zod";

import {
  CONSUMPTION_METRICS,
  type ConsumptionGranularity,
  type ConsumptionMetricName,
  MAX_WINDOW_HOURS,
} from "./consumption";

const MS_PER_HOUR = 3_600_000;

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

const schema = z.object({
  from: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "from must be an RFC 3339 date-time",
  }),
  granularity: z.enum(["hourly", "daily", "monthly"]).default("daily"),
  metrics: z
    .string()
    .transform(csv)
    .pipe(z.array(z.enum(CONSUMPTION_METRICS)).nonempty())
    .optional(),
  project_ids: z.string().transform(csv).optional(),
  to: z.string().refine((value) => !Number.isNaN(Date.parse(value)), {
    message: "to must be an RFC 3339 date-time",
  }),
});

/**
 * Validates a consumption request before it reaches Neon.
 *
 * A window past what its granularity reaches comes back as Neon's 406, which
 * a proxy can only report as an upstream failure — naming neither the
 * problem nor the fix. Refusing it here says which limit was crossed and by
 * how much.
 */
export const parseConsumptionQuery = (
  params: URLSearchParams,
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

  if (windowHours > MAX_WINDOW_HOURS[granularity]) {
    return {
      error: `${granularity} consumption reaches back ${MAX_WINDOW_HOURS[granularity]} hours; asked for ${Math.ceil(windowHours)}`,
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
