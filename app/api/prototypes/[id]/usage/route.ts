import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getPrototype, getUsage } from "@/lib/prototypes";

/** Billing-aligned v2 consumption for this prototype's Neon project. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const usage = await getUsage(proto);
    return NextResponse.json({ usage });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
