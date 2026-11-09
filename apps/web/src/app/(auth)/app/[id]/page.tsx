import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import { Workspace } from "@/components/workspace";
import { serverClient } from "@/lib/server";

/** One lookup per request, shared by the page and its metadata. */
const getPrototype = cache(async (id: string) => {
  const client = await serverClient();
  return client.prototypes.get({ id }).catch(() => null);
});

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const proto = await getPrototype((await params).id);
  // Absolute: this title streams into the body after the shell, where the
  // parent template is not applied.
  return { title: { absolute: `${proto?.name ?? "App"} · Vibe` } };
}

export default async function WorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ prompt?: string }>;
}) {
  const [{ id }, { prompt }] = await Promise.all([params, searchParams]);
  const proto = await getPrototype(id);
  if (!proto) {
    notFound();
  }
  return <Workspace initial={proto} initialPrompt={prompt?.trim() || undefined} />;
}
