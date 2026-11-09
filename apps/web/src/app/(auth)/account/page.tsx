"use client";

import { Button } from "@vibe/ui/components/button";
import { Input } from "@vibe/ui/components/input";
import { Skeleton } from "@vibe/ui/components/skeleton";
import { type ReactNode, useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog/confirm-dialog";
import { TeardownOverlay } from "@/components/teardown-overlay";
import { TopNav } from "@/components/top-nav";
import { relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

type SessionRow = {
  id: string;
  token: string;
  createdAt: Date | string;
  userAgent?: string | null;
};

/** "Brave · macOS" from a user agent, best effort. */
function describeAgent(ua: string | null | undefined): string {
  if (!ua) {
    return "Unknown device";
  }
  const browser = ua.match(/(Brave|Firefox|Edg|Chrome|Safari)/)?.[1] ?? "Browser";
  const os = ua.match(/(Macintosh|Windows|Linux|iPhone|Android)/)?.[1] ?? "";
  return os ? `${browser} · ${os.replace("Macintosh", "macOS")}` : browser;
}

export default function AccountPage() {
  const { data: session } = authClient.useSession();

  return (
    <div className="flex min-h-svh flex-col">
      <TopNav />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:px-6">
        <header className="mb-8">
          <h1 className="font-semibold text-2xl tracking-tight">Account</h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Your profile, password, signed-in devices, and account deletion.
          </p>
        </header>
        <div className="flex flex-col gap-6">
          <ProfileSection
            email={session?.user.email ?? ""}
            initialName={session?.user.name ?? ""}
          />
          <PasswordSection />
          <SessionsSection currentToken={session?.session.token} />
          <DangerSection />
        </div>
      </main>
    </div>
  );
}

function Section({
  title,
  description,
  tone = "default",
  children,
}: {
  title: string;
  description?: string;
  tone?: "default" | "danger";
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className={cn(
        "rounded-lg border bg-card p-5",
        tone === "danger" ? "border-destructive/30" : "border-border/60",
      )}
    >
      <h2 className={cn("font-medium text-sm", tone === "danger" && "text-destructive")} id={id}>
        {title}
      </h2>
      {description ? <p className="mt-1 text-muted-foreground text-xs">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label className="mb-1.5 block text-muted-foreground text-xs" htmlFor={htmlFor}>
      {children}
    </label>
  );
}

function ProfileSection({ initialName, email }: { initialName: string; email: string }) {
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  // Session loads async; adopt the real name once it arrives.
  useEffect(() => setName(initialName), [initialName]);
  const dirty = name.trim() !== initialName && name.trim().length > 0;

  async function save() {
    if (!dirty || saving) {
      return;
    }
    setSaving(true);
    const res = await authClient.updateUser({ name: name.trim() });
    setSaving(false);
    if (res.error) {
      toast.error(res.error.message || "Could not update name");
      return;
    }
    toast.success("Name updated.");
  }

  return (
    <Section description="How you appear in Vibe." title="Profile">
      <div className="space-y-4">
        <div>
          <FieldLabel htmlFor="account-name">Name</FieldLabel>
          <div className="flex gap-2">
            <Input
              id="account-name"
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
              value={name}
            />
            <Button disabled={!dirty || saving} onClick={save} size="sm">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </div>
        <div>
          <p className="mb-1.5 text-muted-foreground text-xs">Email</p>
          {email ? <p className="truncate text-sm">{email}</p> : <Skeleton className="h-5 w-56" />}
        </div>
      </div>
    </Section>
  );
}

function PasswordSection() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [busy, setBusy] = useState(false);
  const valid = current.length >= 8 && next.length >= 8;

  async function change() {
    if (!valid || busy) {
      return;
    }
    setBusy(true);
    const res = await authClient.changePassword({
      currentPassword: current,
      newPassword: next,
      revokeOtherSessions: true,
    });
    setBusy(false);
    if (res.error) {
      toast.error(res.error.message || "Could not change password");
      return;
    }
    setCurrent("");
    setNext("");
    toast.success("Password changed — other sessions signed out.");
  }

  return (
    <Section description="Changing it signs out every other device." title="Password">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          change();
        }}
      >
        <div>
          <FieldLabel htmlFor="account-current-password">Current password</FieldLabel>
          <Input
            autoComplete="current-password"
            id="account-current-password"
            onChange={(e) => setCurrent(e.target.value)}
            type="password"
            value={current}
          />
        </div>
        <div>
          <FieldLabel htmlFor="account-new-password">New password</FieldLabel>
          <Input
            aria-describedby="account-new-password-hint"
            autoComplete="new-password"
            id="account-new-password"
            onChange={(e) => setNext(e.target.value)}
            type="password"
            value={next}
          />
          <p className="mt-1.5 text-muted-foreground text-xs" id="account-new-password-hint">
            At least 8 characters.
          </p>
        </div>
        <div className="sm:col-span-2">
          <Button disabled={!valid || busy} size="sm" type="submit">
            {busy ? "Changing…" : "Change password"}
          </Button>
        </div>
      </form>
    </Section>
  );
}

function SessionsSection({ currentToken }: { currentToken?: string }) {
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await authClient.listSessions();
    if (!res.error && res.data) {
      setSessions(res.data as SessionRow[]);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function revoke(token: string) {
    const res = await authClient.revokeSession({ token });
    if (res.error) {
      toast.error(res.error.message || "Could not revoke session");
      return;
    }
    toast.success("Session revoked.");
    load();
  }

  return (
    <Section description="Everywhere this account is signed in." title="Sessions">
      {!loaded ? (
        <div aria-busy="true" aria-label="Loading sessions" className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-4/5" />
        </div>
      ) : sessions.length === 0 ? (
        <p className="text-muted-foreground text-xs">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-border/60">
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken;
            return (
              <li className="flex items-center gap-3 py-2.5" key={s.id}>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="truncate">{describeAgent(s.userAgent)}</span>
                    {isCurrent && (
                      <span className="shrink-0 rounded-sm bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                        this device
                      </span>
                    )}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    signed in {relativeTime(new Date(s.createdAt))}
                  </p>
                </div>
                {!isCurrent && (
                  <Button onClick={() => revoke(s.token)} size="sm" variant="ghost">
                    Revoke
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

function DangerSection() {
  const [password, setPassword] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function destroy() {
    setDeleting(true);
    try {
      // Tenant infrastructure first: every sandbox and Neon project.
      const { deleted } = await client.prototypes.teardownAll();
      const res = await authClient.deleteUser({ password });
      if (res.error) {
        throw new Error(res.error.message || "Could not delete account");
      }
      toast.success(
        deleted > 0
          ? `Account deleted — ${deleted} app${deleted === 1 ? "" : "s"} torn down.`
          : "Account deleted.",
      );
      window.location.assign("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <Section
      description="Deletes every app, including its sandbox and Neon project, then the account itself. There is no undo."
      title="Delete account"
      tone="danger"
    >
      <form
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length >= 8 && !deleting) {
            setConfirmOpen(true);
          }
        }}
      >
        <div className="min-w-0 flex-1">
          <FieldLabel htmlFor="account-delete-password">Confirm with your password</FieldLabel>
          <Input
            autoComplete="current-password"
            id="account-delete-password"
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            value={password}
          />
        </div>
        <Button
          disabled={password.length < 8 || deleting}
          size="sm"
          type="submit"
          variant="destructive"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </Button>
      </form>
      <TeardownOverlay active={deleting} label="Deleting your apps and account…" />
      <ConfirmDialog
        confirmLabel="Hold to delete account"
        description="Every app, database, and checkpoint goes with it. This cannot be reversed."
        onConfirm={destroy}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Delete this account?"
      />
    </Section>
  );
}
