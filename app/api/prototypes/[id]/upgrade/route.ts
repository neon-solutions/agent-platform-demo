import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getPrototype, upgradeToPaid } from "@/lib/prototypes";

// Project transfer + re-resolve can take a moment.
export const maxDuration = 120;

/** Upgrade a free app to paid by transferring its Neon project free-org → paid-org. */
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const updated = await upgradeToPaid(id);
    return NextResponse.json({ prototype: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
