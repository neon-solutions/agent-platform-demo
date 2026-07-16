import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL is not set. Add the control-plane pooled connection string to .env.");
}

// One pool per server instance, reused across requests.
const globalForDb = globalThis as unknown as { __pool?: Pool };
const pool = globalForDb.__pool ?? new Pool({ connectionString, max: 5 });
if (process.env.NODE_ENV !== "production") globalForDb.__pool = pool;

export const db = drizzle(pool, { schema });
