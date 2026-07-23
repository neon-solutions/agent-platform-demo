import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";

/**
 * A prototype is one vibe-coded app: an isolated tenant Neon Postgres project
 * (in the free or paid org) plus a Vercel Sandbox that builds and serves it.
 */
export const prototype = pgTable("prototype", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** What the app is — seeded from the creating prompt, editable later. */
  description: text("description"),
  /** Which tenant org tier the database lives in. */
  plan: text("plan", { enum: ["free", "paid"] })
    .notNull()
    .default("free"),
  /** lifecycle: provisioning → ready → error */
  status: text("status", { enum: ["provisioning", "ready", "error"] })
    .notNull()
    .default("provisioning"),
  statusDetail: text("status_detail"),

  // Tenant Neon project (the database behind this app).
  neonOrgId: text("neon_org_id"),
  neonProjectId: text("neon_project_id"),
  neonBranchId: text("neon_branch_id"),
  /** Pooled connection string handed to the sandbox app as DATABASE_URL. */
  databaseUrl: text("database_url"),

  // Vercel Sandbox that runs the generated app.
  sandboxId: text("sandbox_id"),
  sandboxUrl: text("sandbox_url"),
  /** Sandbox git working state persisted for restore/reopen. */
  sandboxSnapshotUrl: text("sandbox_snapshot_url"),

  /**
   * The checkpoint the running app currently reflects — set by restore,
   * advanced when the agent snaps a new checkpoint. Null means "the
   * newest checkpoint" (nothing was ever restored). Plain uuid, no FK:
   * checkpoint already references prototype, and a stale id must not
   * block checkpoint deletion.
   */
  activeCheckpointId: uuid("active_checkpoint_id"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * A checkpoint captures both halves of a version: the code (a git commit in
 * the sandbox) and the data (a Neon snapshot of the tenant branch). Restoring
 * a checkpoint resets both so the code "just works" against its schema+data.
 */
export const checkpoint = pgTable("checkpoint", {
  id: uuid("id").primaryKey().defaultRandom(),
  prototypeId: uuid("prototype_id")
    .notNull()
    .references(() => prototype.id, { onDelete: "cascade" }),
  label: text("label").notNull(),
  /** git commit SHA in the sandbox repo (the source-revision dimension). */
  gitSha: text("git_sha"),
  /** Neon snapshot id of the tenant branch (the data dimension). */
  snapshotId: text("snapshot_id"),
  /**
   * Compound-checkpoint dimensions: a checkpoint binds source + database
   * state + deploy surface, not a Neon snapshot alone. Record which tenant
   * project/branch the snapshot belongs to and the runnable surface
   * (sandbox URL) at checkpoint time.
   */
  neonProjectId: text("neon_project_id"),
  neonBranchId: text("neon_branch_id"),
  sandboxUrl: text("sandbox_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Prototype = typeof prototype.$inferSelect;
export type Checkpoint = typeof checkpoint.$inferSelect;
