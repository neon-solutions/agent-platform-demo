import {
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
} from "drizzle-orm/pg-core";

/* ────────────────────────────────────────────────────────────────────────
 * Better Auth core tables (email/password + JWT plugin).
 * Column names follow Better Auth's default Drizzle schema so the adapter
 * needs no aliasing. The auth runtime owns these — don't mutate from app code.
 * ──────────────────────────────────────────────────────────────────────── */
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** Better Auth `jwt` plugin key store — used to sign/verify agent JWTs (JWKS). */
export const jwks = pgTable("jwks", {
  id: text("id").primaryKey(),
  publicKey: text("public_key").notNull(),
  privateKey: text("private_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ────────────────────────────────────────────────────────────────────────
 * Platform tables — the control-plane source of truth.
 * ──────────────────────────────────────────────────────────────────────── */

/**
 * A vibe-coded app ("prototype"). Each one owns an isolated tenant Neon
 * Postgres project (in the free or paid org) plus a Vercel Sandbox that
 * builds & serves it.
 */
export const prototype = pgTable("prototype", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  /** Which tenant org tier the database lives in. */
  plan: text("plan", { enum: ["free", "paid"] }).notNull().default("free"),
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
  /** Neon snapshot id of the tenant branch at this checkpoint (the data dimension). */
  snapshotId: text("snapshot_id"),
  /**
   * Compound-checkpoint dimensions (per neon-for-agent-platforms): a checkpoint
   * is a version record that binds source + database state + deploy surface, not
   * a Neon snapshot alone. We record which tenant project/branch the snapshot
   * belongs to and the runnable surface (sandbox URL) at checkpoint time.
   */
  neonProjectId: text("neon_project_id"),
  neonBranchId: text("neon_branch_id"),
  sandboxUrl: text("sandbox_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type User = typeof user.$inferSelect;
export type Prototype = typeof prototype.$inferSelect;
export type Checkpoint = typeof checkpoint.$inferSelect;
