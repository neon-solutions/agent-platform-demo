import { createRouterClient } from "@orpc/server";
import { createContext } from "@vibe/api/context";
import { appRouter } from "@vibe/api/routers/index";
import { auth } from "@vibe/auth";
import { headers } from "next/headers";

/** The caller's Better Auth session, from the request cookies. */
export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

/**
 * Direct (in-process) oRPC caller for server components and route flows —
 * no HTTP hop, same context shape as the /api/rpc mount.
 */
export async function serverClient() {
  const incoming = await headers();
  const req = new Request("http://internal.invalid", { headers: incoming });
  return createRouterClient(appRouter, {
    context: () => createContext({ req }),
  });
}
