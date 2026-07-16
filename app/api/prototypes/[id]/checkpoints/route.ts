import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getPrototype, listCheckpoints } from "@/lib/prototypes";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });
  const checkpoints = await listCheckpoints(id);
  return NextResponse.json({ checkpoints });
}
