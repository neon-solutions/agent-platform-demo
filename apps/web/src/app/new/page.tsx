import { redirect } from "next/navigation";

import { getSession, serverClient } from "@/lib/server";

const NAME_MAX = 60;

/**
 * Prompt-first entry: /new?prompt=... creates the app and drops the user
 * straight into the workspace, where the prompt is auto-sent to the agent
 * once the sandbox is up. Unauthenticated users bounce through login with
 * the prompt preserved in `next`.
 */
export default async function NewPage({
  searchParams,
}: {
  searchParams: Promise<{ prompt?: string; plan?: string }>;
}) {
  const params = await searchParams;
  const trimmed = (params.prompt ?? "").trim();
  if (!trimmed) {
    redirect("/");
  }

  const plan = params.plan === "paid" ? "paid" : "free";
  const session = await getSession();
  if (!session) {
    const next = `/new?prompt=${encodeURIComponent(trimmed)}&plan=${plan}`;
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const name = trimmed.length > NAME_MAX ? `${trimmed.slice(0, NAME_MAX - 1)}…` : trimmed;
  const client = await serverClient();
  const proto = await client.prototypes.create({
    name,
    plan,
    description: trimmed,
  });
  redirect(`/app/${proto.id}?prompt=${encodeURIComponent(trimmed)}`);
}
