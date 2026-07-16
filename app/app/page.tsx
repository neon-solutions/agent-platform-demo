import Link from "next/link";
import { requireUser } from "@/lib/session";
import { listPrototypes } from "@/lib/prototypes";
import { NewApp } from "@/components/new-app";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const statusVariant: Record<string, "default" | "muted" | "error"> = {
  ready: "default",
  provisioning: "muted",
  error: "error",
};

export default async function Dashboard() {
  const session = await requireUser();
  const prototypes = await listPrototypes(session.user.id);

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-semibold">
            <span className="text-primary">◆</span> Vibe
          </h1>
          <p className="text-sm text-muted-foreground">
            Vibe-code full-stack apps — each gets its own Neon Postgres + live sandbox.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{session.user.email}</span>
          <SignOutButton />
        </div>
      </header>

      <NewApp />

      <section className="mt-10">
        <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
          Your apps
        </h2>
        {prototypes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-10 text-center text-muted-foreground">
            No apps yet. Describe one above to get started.
          </p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {prototypes.map((p) => (
              <Link
                key={p.id}
                href={`/app/${p.id}`}
                className="group rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50"
              >
                <div className="mb-3 flex items-center justify-between">
                  <Badge variant={statusVariant[p.status] ?? "muted"}>{p.status}</Badge>
                  <Badge variant="muted">{p.plan} db</Badge>
                </div>
                <div className="font-medium group-hover:text-primary">{p.name}</div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {new Date(p.createdAt).toLocaleString()}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
