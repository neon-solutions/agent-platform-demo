import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { requireUser } from "@/lib/session";
import { getPrototype } from "@/lib/prototypes";
import { db } from "@/lib/db/client";
import { prototype } from "@/lib/db/schema";
import { ensureAppRunning } from "@/lib/sandbox";

// Resuming a stopped sandbox + restarting the dev server can take a bit.
export const maxDuration = 120;

/**
 * Wake a prototype's app: resume its sandbox and make sure the dev server is
 * listening. Called when the workspace opens (and when the preview errors), so
 * reopening a saved prototype brings it back up instead of 502-ing.
 */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (proto.status !== "ready" || !proto.databaseUrl) {
    return NextResponse.json({ error: "prototype not ready" }, { status: 409 });
  }

  try {
    const { url } = await ensureAppRunning(proto.sandboxId ?? proto.id, proto.databaseUrl);
    if (url !== proto.sandboxUrl) {
      await db
        .update(prototype)
        .set({ sandboxUrl: url, updatedAt: new Date() })
        .where(eq(prototype.id, id));
    }
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
