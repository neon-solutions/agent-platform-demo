import { notFound } from "next/navigation";

import { Workspace } from "@/components/workspace";
import { serverClient } from "@/lib/server";

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [{ id }, { prompt }] = await Promise.all([params, searchParams]);
  const client = await serverClient();
  const proto = await client.prototypes.get({ id }).catch(() => null);
  if (!proto) {
    notFound();
  }
  return <Workspace initial={proto} initialPrompt={prompt?.trim() || undefined} />;
}
