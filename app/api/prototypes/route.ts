import { NextResponse } from "next/server";
import { requireUser } from "@/lib/session";
import { createPrototype, listPrototypes } from "@/lib/prototypes";
import type { Plan } from "@/lib/neon";

export async function GET() {
  const session = await requireUser();
  const rows = await listPrototypes(session.user.id);
  return NextResponse.json({ prototypes: rows });
}

export async function POST(req: Request) {
  const session = await requireUser();
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "Untitled app";
  const plan: Plan = body.plan === "paid" ? "paid" : "free";
  const proto = await createPrototype(session.user.id, name, plan);
  return NextResponse.json({ id: proto.id });
}
