import "server-only";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

const secret = process.env.BETTER_AUTH_SECRET;
if (!secret) {
  throw new Error("BETTER_AUTH_SECRET is not set. Pick a 32+ character random value.");
}

const baseURL = process.env.BETTER_AUTH_URL ?? "http://localhost:3040";

/**
 * Better Auth wired to the control-plane Neon Postgres via Drizzle.
 *
 * The `jwt` plugin publishes a JWKS at `${baseURL}/api/auth/jwks` and mints
 * short-lived EdDSA tokens (issuer + audience = baseURL). The browser hands
 * one of these to the Mastra coding agent (a Neon Function) so it can verify
 * the caller without the control app sitting in the path of the long stream.
 */
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      jwks: schema.jwks,
    },
  }),
  secret,
  baseURL,
  trustedOrigins: [baseURL],
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
    autoSignIn: true,
    minPasswordLength: 8,
  },
  session: {
    cookieCache: { enabled: true, maxAge: 5 * 60 },
  },
  plugins: [
    jwt({
      jwt: {
        // Short-lived: the client re-mints per agent request/reconnect.
        expirationTime: "15m",
      },
    }),
  ],
});

export type Session = typeof auth.$Infer.Session;
