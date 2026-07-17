import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prototype, checkpoint, type Prototype, type Checkpoint } from "@/lib/db/schema";
import {
  provisionTenantDb,
  restoreTenantSnapshot,
  resolveConnection,
  transferProjectToPaid,
  getProjectConsumption,
  type Plan,
} from "@/lib/neon";
import { createAppSandbox, getAppSandbox, runInSandbox, startDevServer } from "@/lib/sandbox";

export async function listPrototypes(userId: string): Promise<Prototype[]> {
  return db
    .select()
    .from(prototype)
    .where(eq(prototype.userId, userId))
    .orderBy(desc(prototype.createdAt));
}

export async function getPrototype(id: string, userId: string): Promise<Prototype | null> {
  const rows = await db
    .select()
    .from(prototype)
    .where(and(eq(prototype.id, id), eq(prototype.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createPrototype(
  userId: string,
  name: string,
  plan: Plan
): Promise<Prototype> {
  const rows = await db
    .insert(prototype)
    .values({ userId, name: name.trim() || "Untitled app", plan, status: "provisioning" })
    .returning();
  return rows[0]!;
}

/**
 * The heavy, long-running half of creating an app: provision an isolated Neon
 * Postgres project (in the free/paid org) and spin up a Vercel Sandbox that
 * serves the starter app against it. Idempotent-ish: safe to re-run on an
 * errored prototype.
 */
export async function provisionPrototype(id: string): Promise<Prototype> {
  const rows = await db.select().from(prototype).where(eq(prototype.id, id)).limit(1);
  const proto = rows[0];
  if (!proto) throw new Error("prototype not found");
  if (proto.status === "ready" && proto.sandboxUrl) return proto;

  try {
    await setStatus(id, "provisioning", "Provisioning Neon Postgres…");
    const dbInfo = await provisionTenantDb(proto.plan as Plan, `vibe-${id.slice(0, 8)}`);

    await db
      .update(prototype)
      .set({
        neonOrgId: dbInfo.orgId,
        neonProjectId: dbInfo.projectId,
        neonBranchId: dbInfo.branchId,
        databaseUrl: dbInfo.databaseUrl,
        statusDetail: "Booting Vercel Sandbox…",
        updatedAt: new Date(),
      })
      .where(eq(prototype.id, id));

    const sandbox = await createAppSandbox({ name: id, databaseUrl: dbInfo.databaseUrl });

    const updated = await db
      .update(prototype)
      .set({
        sandboxId: sandbox.name,
        sandboxUrl: sandbox.url,
        status: "ready",
        statusDetail: null,
        updatedAt: new Date(),
      })
      .where(eq(prototype.id, id))
      .returning();
    return updated[0]!;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setStatus(id, "error", message.slice(0, 500));
    throw err;
  }
}

async function setStatus(
  id: string,
  status: Prototype["status"],
  detail: string | null
): Promise<void> {
  await db
    .update(prototype)
    .set({ status, statusDetail: detail, updatedAt: new Date() })
    .where(eq(prototype.id, id));
}

export async function listCheckpoints(prototypeId: string): Promise<Checkpoint[]> {
  return db
    .select()
    .from(checkpoint)
    .where(eq(checkpoint.prototypeId, prototypeId))
    .orderBy(desc(checkpoint.createdAt));
}

/**
 * Dual-org economics: upgrade a free-tier app to paid by transferring its Neon
 * project from the sponsored free org to the paid org (data + connection string
 * preserved; only the billing boundary moves). Uses the personal API key.
 */
export async function upgradeToPaid(id: string): Promise<Prototype> {
  const rows = await db.select().from(prototype).where(eq(prototype.id, id)).limit(1);
  const proto = rows[0];
  if (!proto) throw new Error("prototype not found");
  if (proto.plan === "paid") return proto;
  if (!proto.neonProjectId) throw new Error("prototype has no Neon project to transfer");

  const toOrgId = await transferProjectToPaid(proto.neonProjectId);
  // Re-resolve against the paid org (which now owns the project).
  const { branchId, databaseUrl } = await resolveConnection("paid", proto.neonProjectId);

  const updated = await db
    .update(prototype)
    .set({
      plan: "paid",
      neonOrgId: toOrgId,
      neonBranchId: branchId,
      databaseUrl,
      updatedAt: new Date(),
    })
    .where(eq(prototype.id, id))
    .returning();
  return updated[0]!;
}

/**
 * Compound checkpoint restore: reset BOTH halves of a version — the code (git
 * reset to the commit in the sandbox) and the database (restore the Neon
 * snapshot) — then reconnect the app to the (possibly rotated) branch. This is
 * the "code + data move together" guarantee.
 */
export async function restoreCheckpoint(
  prototypeId: string,
  checkpointId: string
): Promise<Prototype> {
  const [proto] = await db.select().from(prototype).where(eq(prototype.id, prototypeId)).limit(1);
  if (!proto) throw new Error("prototype not found");
  const [cp] = await db
    .select()
    .from(checkpoint)
    .where(and(eq(checkpoint.id, checkpointId), eq(checkpoint.prototypeId, prototypeId)))
    .limit(1);
  if (!cp) throw new Error("checkpoint not found");

  const plan = proto.plan as Plan;
  let databaseUrl = proto.databaseUrl ?? "";
  let branchId = proto.neonBranchId ?? "";

  // 1) Data: restore the Neon snapshot onto the live branch (finalize). Neon
  //    rotates the branch id, so re-resolve the connection afterwards.
  if (cp.snapshotId && proto.neonProjectId && branchId) {
    await restoreTenantSnapshot(plan, proto.neonProjectId, cp.snapshotId, branchId);
    const resolved = await resolveConnection(plan, proto.neonProjectId);
    branchId = resolved.branchId;
    databaseUrl = resolved.databaseUrl;
  }

  // 2) Code: reset the sandbox repo to the checkpoint's commit and relaunch the
  //    dev server against the (possibly new) DATABASE_URL.
  const sandbox = await getAppSandbox(proto.sandboxId ?? proto.id);
  if (cp.gitSha) {
    await runInSandbox(sandbox, `git reset --hard ${cp.gitSha}`);
  }
  await startDevServer(sandbox, databaseUrl);

  const updated = await db
    .update(prototype)
    .set({ neonBranchId: branchId, databaseUrl, sandboxUrl: sandbox.domain(3000), updatedAt: new Date() })
    .where(eq(prototype.id, prototypeId))
    .returning();
  return updated[0]!;
}

export interface UsageSummary {
  from: string;
  to: string;
  projectId: string;
  plan: Plan;
  metrics: Record<string, number>;
}

/** Billing-aligned usage for a prototype's Neon project over the last 30 days. */
export async function getUsage(proto: Prototype): Promise<UsageSummary | null> {
  if (!proto.neonProjectId) return null;
  const to = new Date();
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
  const projects = await getProjectConsumption(
    proto.plan as Plan,
    proto.neonProjectId,
    from.toISOString(),
    to.toISOString(),
    "daily"
  );

  // Sum each metric across all returned periods.
  const metrics: Record<string, number> = {};
  for (const p of projects as Array<{ periods?: Array<{ consumption?: Array<Record<string, unknown>> }> }>) {
    for (const period of p.periods ?? []) {
      for (const row of period.consumption ?? []) {
        for (const [k, v] of Object.entries(row)) {
          if (typeof v === "number" && k !== "timeframe_start" && k !== "timeframe_end") {
            metrics[k] = (metrics[k] ?? 0) + v;
          }
        }
      }
    }
  }

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    projectId: proto.neonProjectId,
    plan: proto.plan as Plan,
    metrics,
  };
}
