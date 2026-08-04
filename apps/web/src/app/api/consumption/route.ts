import { CONSUMPTION_METRICS, type ConsumptionMetric, getProjectsConsumption } from "@vibe/neon";
import type { NextRequest } from "next/server";

import { parseConsumptionQuery } from "@/lib/consumption-query";
import { getSession, serverClient } from "@/lib/server";

/**
 * The consumption proxy `useConsumptionHistory` expects.
 *
 * The org API keys are server-only, so the browser can never call
 * console.neon.tech itself. This route is the seam: it authenticates the
 * caller, narrows the request to the projects that caller actually owns,
 * and hands back the project entries as Neon wrote them — nested periods,
 * raw units. Every conversion happens at the display edge via
 * lib/consumption.
 *
 * The envelope is ours: apps live in one of two tenant orgs (free and paid),
 * each behind its own key, so a fleet spanning both is two paginated fetches
 * concatenated into one `projects` array.
 */
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = parseConsumptionQuery(req.nextUrl.searchParams);
  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const { from, granularity, metrics, projectIds, to } = parsed.query;

  // Ownership is resolved from the caller's own apps, never from the query:
  // project_ids is a filter over what they have, not a selector over Neon.
  const client = await serverClient();
  const owned = await client.prototypes.list();
  const requested = new Set(projectIds);

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
      getProjectsConsumption("free", byPlan.free, from, to, granularity, requestedMetrics),
      getProjectsConsumption("paid", byPlan.paid, from, to, granularity, requestedMetrics),
    ]);
    return Response.json({ projects: [...free, ...paid] });
  } catch (error) {
    console.error("consumption fetch failed", error);
    return Response.json({ error: "consumption unavailable" }, { status: 502 });
  }
}
