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
    // The v2 consumption API is gated to Launch+ plans. On the free tier it's
    // simply not available yet — surface that as a state, not a hard error.
    if (/Launch plan|not available/i.test(message)) {
      return NextResponse.json({ usage: null, planGated: true, reason: message });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
