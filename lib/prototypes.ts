import "server-only";
import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { prototype, checkpoint, type Prototype, type Checkpoint } from "@/lib/db/schema";
import { provisionTenantDb, type Plan } from "@/lib/neon";
import { createAppSandbox } from "@/lib/sandbox";

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
