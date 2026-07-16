import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth, type Session } from "@/lib/auth";

/** Resolve the session or redirect to /login. */
export async function requireUser(returnTo?: string): Promise<Session> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) {
    const target = returnTo ? `?next=${encodeURIComponent(returnTo)}` : "";
    redirect(`/login${target}`);
  }
  return session;
}

export async function maybeUser(): Promise<Session | null> {
  return auth.api.getSession({ headers: await headers() });
}

/** Mint a short-lived JWT for the current user to call the agent directly. */
export async function mintAgentToken(): Promise<string | null> {
  const result = await auth.api.getToken({ headers: await headers() });
  return result?.token ?? null;
}
