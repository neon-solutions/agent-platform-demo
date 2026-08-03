import { getProjectsConsumption } from "@vibe/neon";
import type { NextRequest } from "next/server";

import { getSession, serverClient } from "@/lib/server";

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

  const params = req.nextUrl.searchParams;
  const from = params.get("from");
  const to = params.get("to");
  if (!(from && to)) {
    return Response.json({ error: "from and to are required" }, { status: 400 });
  }
  const granularity = params.get("granularity") ?? "daily";
  if (granularity !== "hourly" && granularity !== "daily" && granularity !== "monthly") {
    return Response.json({ error: "invalid granularity" }, { status: 400 });
  }

  // Ownership is resolved from the caller's own apps, never from the query:
  // project_ids is a filter over what they have, not a selector over Neon.
  const client = await serverClient();
  const owned = await client.prototypes.list();
  const requested = new Set(
    (params.get("project_ids") ?? "")
      .split(",")
      .map((id) => id.trim())
      .filter(Boolean),
  );

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

  try {
    const [free, paid] = await Promise.all([
      getProjectsConsumption("free", byPlan.free, from, to, granularity),
      getProjectsConsumption("paid", byPlan.paid, from, to, granularity),
    ]);
    return Response.json({ projects: [...free, ...paid] });
  } catch (error) {
    console.error("consumption fetch failed", error);
    return Response.json({ error: "consumption unavailable" }, { status: 502 });
  }
}
