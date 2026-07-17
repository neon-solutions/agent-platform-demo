import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getPrototype, restoreCheckpoint } from "@/lib/prototypes";

// Restore resets code (git) + data (snapshot) + reconnects — allow time.
export const maxDuration = 300;

/** Compound restore: reset code + database to a checkpoint, together. */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; cid: string }> }
) {
  const session = await requireUser();
  const { id, cid } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const updated = await restoreCheckpoint(id, cid);
    return NextResponse.json({ prototype: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
