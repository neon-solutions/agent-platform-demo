import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { getPrototype, provisionPrototype } from "@/lib/prototypes";

// Provisioning creates a Neon project + boots a Vercel Sandbox (npm install +
// dev server), which can take a while — give it room.
export const maxDuration = 300;

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) return NextResponse.json({ error: "not found" }, { status: 404 });

  try {
    const updated = await provisionPrototype(id);
    return NextResponse.json({ prototype: updated });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
