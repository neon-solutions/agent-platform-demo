import { createDb } from "@vibe/db";
import * as schema from "@vibe/db/schema/auth";
import { env } from "@vibe/env/server";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

export function createAuth() {
  const db = createDb();

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",

      schema: schema,
    }),
    trustedOrigins: [env.CORS_ORIGIN],
    emailAndPassword: {
      enabled: true,
    },
    user: {
      deleteUser: {
        // Tenant teardown happens first via prototypes.teardownAll; this
        // removes the account row (prototypes cascade at the DB level).
        enabled: true,
      },
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    plugins: [
      // Publishes a JWKS at `${baseURL}/api/auth/jwks` and mints short-lived
      // JWTs the browser uses to call the agent Neon Function directly.
      jwt({
        jwt: {
          // Short-lived: the client re-mints per agent request/reconnect.
          expirationTime: "15m",
        },
      }),
      tanstackStartCookies(),
    ],
  });
}

export const auth = createAuth();
