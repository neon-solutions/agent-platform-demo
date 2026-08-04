import { CONSUMPTION_METRICS, type ConsumptionMetric, getProjectsConsumption } from "@vibe/neon";
import type { NextRequest } from "next/server";
import { z } from "zod";

import { MAX_WINDOW_HOURS } from "@/lib/consumption";
import { getSession, serverClient } from "@/lib/server";

const MS_PER_HOUR = 3_600_000;

const rfc3339 = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "must be an RFC 3339 date-time");

const querySchema = z.object({
  from: rfc3339,
  granularity: z.enum(["hourly", "daily", "monthly"]).default("daily"),
  metrics: z
    .string()
    .transform((value) => value.split(",").filter(Boolean))
    .pipe(z.array(z.enum(CONSUMPTION_METRICS)).nonempty())
    .optional(),
  project_ids: z
    .string()
    .transform((value) => value.split(",").map((id) => id.trim()).filter(Boolean))
    .optional(),
  to: rfc3339,
});

/**
 * The consumption proxy `useConsumptionHistory` expects.
 *
 * The org API keys are server-only, so the browser can never call
 * console.neon.tech itself. This route is the seam: it authenticates the
 * caller, narrows the request to the projects that caller actually owns,
 * and returns Neon's v2 response untouched — nested periods, raw units.
 * Every conversion happens at the display edge via lib/consumption.
 *
 * Apps live in one of two tenant orgs (free and paid), each behind its own
 * key, so a fleet spanning both is two fetches merged back into one
 * `projects` array.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const query = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!query.success) {
    return Response.json({ error: z.prettifyError(query.error) }, { status: 400 });
  }
  const { from, granularity, metrics, project_ids } = query.data;

  // Neon answers 406 for a window its granularity cannot reach. Catching it
  // here names the actual problem instead of reporting it as an upstream
  // failure the caller can do nothing about.
  const windowHours = (Date.parse(query.data.to) - Date.parse(from)) / MS_PER_HOUR;
  if (windowHours <= 0) {
    return Response.json({ error: "from must be before to" }, { status: 400 });
  }
  if (windowHours > MAX_WINDOW_HOURS[granularity]) {
    return Response.json(
      {
        error: `${granularity} consumption reaches back ${MAX_WINDOW_HOURS[granularity]} hours; asked for ${Math.ceil(windowHours)}`,
      },
      { status: 400 },
    );
  }

  // Ownership is resolved from the caller's own apps, never from the query:
  // project_ids is a filter over what they have, not a selector over Neon.
  const client = await serverClient();
  const owned = await client.prototypes.list();
  const requested = new Set(project_ids ?? []);

  const byPlan = { free: [] as string[], paid: [] as string[] };
  for (const proto of owned) {
    if (!proto.neonProjectId) {
      continue;
    }
    if (requested.size > 0 && !requested.has(proto.neonProjectId)) {
      continue;
    }
    byPlan[proto.plan === "paid" ? "paid" : "free"].push(proto.neonProjectId);
  }

  const requestedMetrics: readonly ConsumptionMetric[] = metrics ?? CONSUMPTION_METRICS;

  try {
    const [free, paid] = await Promise.all([
      getProjectsConsumption(
        "free",
        byPlan.free,
        from,
        query.data.to,
        granularity,
        requestedMetrics,
      ),
      getProjectsConsumption(
        "paid",
        byPlan.paid,
        from,
        query.data.to,
        granularity,
        requestedMetrics,
      ),
    ]);
    return Response.json({ projects: [...free, ...paid] });
  } catch (error) {
    console.error("consumption fetch failed", error);
    return Response.json({ error: "consumption unavailable" }, { status: 502 });
  }
}
