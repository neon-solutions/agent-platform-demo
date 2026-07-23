"use client";

import { Button } from "@vibe/ui/components/button";
import { Input } from "@vibe/ui/components/input";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog/confirm-dialog";
import { TeardownOverlay } from "@/components/teardown-overlay";
import { TopNav } from "@/components/top-nav";
import { relativeTime } from "@/lib/format";
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
      <TopNav>
        <span className="text-muted-foreground text-sm">/ Account</span>
      </TopNav>
      <main className="mx-auto w-full max-w-2xl flex-1 px-6 py-10">
        <h1 className="font-semibold text-2xl tracking-tight">Account</h1>
        <ProfileSection email={session?.user.email ?? ""} initialName={session?.user.name ?? ""} />
        <PasswordSection />
        <SessionsSection currentToken={session?.session.token} />
        <DangerSection />
      </main>
    </div>
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
    <section className="mt-8">
      <h2 className="mb-3 font-medium text-sm">Profile</h2>
      <div className="space-y-3">
        <div>
          <label className="mb-1.5 block text-muted-foreground text-xs" htmlFor="account-name">
            Name
          </label>
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
          <p className="text-sm">{email}</p>
        </div>
      </div>
    </section>
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
    <section className="mt-8 border-border border-t pt-6">
      <h2 className="mb-3 font-medium text-sm">Password</h2>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          autoComplete="current-password"
          onChange={(e) => setCurrent(e.target.value)}
          placeholder="Current password"
          type="password"
          value={current}
        />
        <Input
          autoComplete="new-password"
          onChange={(e) => setNext(e.target.value)}
          placeholder="New password (8+ characters)"
          type="password"
          value={next}
        />
        <Button disabled={!valid || busy} onClick={change} size="sm">
          {busy ? "Changing…" : "Change"}
        </Button>
      </div>
    </section>
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
    <section className="mt-8 border-border border-t pt-6">
      <h2 className="mb-1 font-medium text-sm">Sessions</h2>
      <p className="mb-3 text-muted-foreground text-xs">Everywhere this account is signed in.</p>
      {loaded && sessions.length === 0 ? (
        <p className="text-muted-foreground text-xs">No active sessions.</p>
      ) : (
        <ul className="divide-y divide-border/60 border-border/60 border-y">
          {sessions.map((s) => {
            const isCurrent = s.token === currentToken;
            return (
              <li className="flex items-center gap-3 py-2.5" key={s.id}>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">
                    {describeAgent(s.userAgent)}
                    {isCurrent && <span className="ml-2 text-primary text-xs">this device</span>}
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
    </section>
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
    <section className="mt-8 border-border border-t pt-6">
      <h2 className="mb-1 font-medium text-sm">Danger zone</h2>
      <p className="mb-3 text-muted-foreground text-xs">
        Deletes every app (sandboxes and Neon projects included), then the account itself. There is
        no undo.
      </p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          autoComplete="current-password"
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Confirm password"
          type="password"
          value={password}
        />
        <Button
          className="border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={password.length < 8 || deleting}
          onClick={() => setConfirmOpen(true)}
          size="sm"
          variant="outline"
        >
          {deleting ? "Deleting…" : "Delete account"}
        </Button>
      </div>
      <TeardownOverlay active={deleting} label="Deleting your apps and account…" />
      <ConfirmDialog
        confirmLabel="Hold to delete account"
        description="Every app, database, and checkpoint goes with it. This cannot be reversed."
        onConfirm={destroy}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title="Delete this account?"
      />
    </section>
  );
}
