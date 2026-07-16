import { NextResponse } from "next/server";
import { requireUser, mintAgentToken } from "@/lib/session";
import { getPrototype } from "@/lib/prototypes";

/**
 * Mint a short-lived Better Auth JWT so the browser can call the agent
 * (a Neon Function) directly, without the app server sitting in the path of
 * the long stream.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });

  const token = await mintAgentToken();
  if (!token) return NextResponse.json({ error: "could not mint token" }, { status: 500 });
  return NextResponse.json({ token });
}
