import { checkpoint, prototype } from "@vibe/db/schema";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

/**
 * The agent talks to the same control-plane Postgres as the web app — Neon
 * injects DATABASE_URL into the function automatically (it runs on the
 * control project's branch). One pool per isolate, reused across requests.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
export const db = drizzle(pool, { schema: { prototype, checkpoint } });

export type PrototypeRow = typeof prototype.$inferSelect;

/**
 * Advance the app's "you are here" marker: a fresh checkpoint is by
 * definition what the running app reflects, superseding any restore.
 */
export async function setActiveCheckpoint(
  prototypeId: string,
  checkpointId: string,
): Promise<void> {
  await db
    .update(prototype)
    .set({ activeCheckpointId: checkpointId, updatedAt: new Date() })
    .where(eq(prototype.id, prototypeId));
}

/** Load a prototype, scoped to the authenticated user (authorization). */
export async function getPrototypeForUser(
  id: string,
  userId: string,
): Promise<PrototypeRow | null> {
  const rows = await db
    .select()
    .from(prototype)
    .where(and(eq(prototype.id, id), eq(prototype.userId, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertCheckpoint(input: {
  prototypeId: string;
  label: string;
  gitSha: string | null;
  snapshotId: string | null;
  neonProjectId: string | null;
  neonBranchId: string | null;
  sandboxUrl: string | null;
}): Promise<{ id: string; label: string; createdAt: Date }> {
  const rows = await db.insert(checkpoint).values(input).returning({
    id: checkpoint.id,
    label: checkpoint.label,
    createdAt: checkpoint.createdAt,
  });
  const row = rows[0];
  if (!row) {
    throw new Error("failed to insert checkpoint");
  }
  return row;
}

export function listCheckpointsForPrototype(prototypeId: string) {
  return db
    .select()
    .from(checkpoint)
    .where(eq(checkpoint.prototypeId, prototypeId))
    .orderBy(desc(checkpoint.createdAt));
}

export async function getCheckpoint(prototypeId: string, checkpointId: string) {
  const rows = await db
    .select()
    .from(checkpoint)
    .where(and(eq(checkpoint.id, checkpointId), eq(checkpoint.prototypeId, prototypeId)))
    .limit(1);
  return rows[0] ?? null;
}
