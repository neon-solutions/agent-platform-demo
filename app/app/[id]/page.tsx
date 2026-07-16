import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getPrototype } from "@/lib/prototypes";
import { Workspace } from "@/components/workspace";

export const dynamic = "force-dynamic";

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireUser();
  const { id } = await params;
  const proto = await getPrototype(id, session.user.id);
  if (!proto) notFound();
  return <Workspace initial={proto} />;
}
