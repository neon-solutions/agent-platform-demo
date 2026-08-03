import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import type { Prototype } from "@vibe/db/schema";
import { Button } from "@vibe/ui/components/button";
import { Input } from "@vibe/ui/components/input";
import { Textarea } from "@vibe/ui/components/textarea";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog/confirm-dialog";
import { PlanBadge } from "@/components/status-badge/status-badge";
import { UpgradeDialog } from "@/components/upgrade-dialog/upgrade-dialog";
import {
  type ConnectionEntry,
  DBConnectionCard,
} from "@/components/db-connection-card/db-connection-card";
import { TeardownOverlay } from "@/components/teardown-overlay";
import { client, orpc } from "@/utils/orpc";

/**
 * Every shape of this app's one credential, for DBConnectionCard.
 *
 * The control plane stores the pooled URI only; the direct one is the same
 * string without the `-pooler` host suffix, which is how Neon names the two
 * endpoints of a branch. Role and database come off the URI, so the card
 * offers exactly what exists rather than an invented menu.
 */
function connectionEntries(uri: string | null): ConnectionEntry[] {
  if (!uri) {
    return [];
  }
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return [];
  }
  const role = decodeURIComponent(url.username);
  const database = url.pathname.replace(/^\//u, "");
  const pooled = url.hostname.includes("-pooler.");
  const entries: ConnectionEntry[] = [{ database, pooled, role, uri }];

  const other = new URL(uri);
  other.hostname = pooled
    ? url.hostname.replace("-pooler.", ".")
    : url.hostname.replace(/^([^.]+)\./u, "$1-pooler.");
  entries.push({ database, pooled: !pooled, role, uri: other.toString() });

  return entries;
}

/**
 * Everything about the app that isn't building it: rename, the tenant
 * database's connection string, plan and upgrade, and the one
 * irreversible action behind its own hairline. Surface-agnostic — the
 * dashboard wraps it in a dialog, the workspace in a drawer.
 */
export function AppSettingsSections({
  proto,
  onRenamed,
  onDeleted,
  onDeleteArmed,
}: {
  proto: Prototype;
  onRenamed: (proto: Prototype) => void;
  /** After teardown; defaults to navigating back to the dashboard. */
  onDeleted?: () => void;
  /** Fired when the delete confirm opens (dialogs use it to step aside). */
  onDeleteArmed?: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [name, setName] = useState(proto.name);
  const [description, setDescription] = useState(proto.description ?? "");
  const [saving, setSaving] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const connections = connectionEntries(proto.databaseUrl);

  const dirty =
    (name.trim() !== proto.name && name.trim().length > 0) ||
    description.trim() !== (proto.description ?? "");

  async function save() {
    if (!dirty || saving) {
      return;
    }
    setSaving(true);
    try {
      const updated = await client.prototypes.rename({
        id: proto.id,
        name: name.trim() || proto.name,
        description: description.trim(),
      });
      onRenamed(updated);
      toast.success("Saved.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function destroy() {
    setDeleting(true);
    try {
      await client.prototypes.delete({ id: proto.id });
      // The card is gone from the cache BEFORE any navigation or toast:
      // the dashboard never shows a deleted app, no refresh required.
      const listKey = orpc.prototypes.list.queryOptions().queryKey;
      queryClient.setQueryData(
        listKey,
        (old: Prototype[] | undefined) => old?.filter((p) => p.id !== proto.id) ?? [],
      );
      await queryClient.invalidateQueries({ queryKey: listKey });
      toast.success("App deleted — sandbox and Neon project torn down.");
      if (onDeleted) {
        onDeleted();
      } else {
        router.push("/app");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
      setDeleting(false);
    }
  }

  return (
    <>
      {/* Rename */}
      <section className="min-w-0">
        <label
          className="mb-1.5 block font-medium text-foreground text-xs"
          htmlFor={`app-name-${proto.id}`}
        >
          Name
        </label>
        <div className="flex min-w-0 gap-2">
          <Input
            className="min-w-0 flex-1"
            id={`app-name-${proto.id}`}
            maxLength={200}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                save();
              }
            }}
            value={name}
          />
          <Button disabled={!dirty || saving} onClick={save} size="sm">
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
        <label
          className="mt-3 mb-1.5 block font-medium text-foreground text-xs"
          htmlFor={`app-description-${proto.id}`}
        >
          Description
        </label>
        <Textarea
          id={`app-description-${proto.id}`}
          maxLength={2000}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this app is for…"
          rows={3}
          value={description}
        />
      </section>

      {/* Connection info */}
      <section className="min-w-0">
        {connections.length > 0 ? (
          <DBConnectionCard connections={connections} defaultPooled label="Connection string" />
        ) : (
          <>
            <p className="mb-1.5 font-medium text-foreground text-xs">Connection string</p>
            <p className="text-muted-foreground text-xs">Available once provisioning completes.</p>
          </>
        )}
      </section>

      {/* Plan + upgrade — the cross-org transfer story lives here now. */}
      <PlanSection onUpdated={onRenamed} proto={proto} />

      {/* Danger zone — pinned to the bottom of flex-column surfaces
          (the drawer); inert in content-sized surfaces (the dialog). */}
      <section className="mt-auto min-w-0 border-border border-t pt-4">
        <Button
          className="w-full border-destructive/40 text-destructive hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
          disabled={deleting}
          onClick={() => {
            onDeleteArmed?.();
            setConfirmOpen(true);
          }}
          size="sm"
          variant="outline"
        >
          {deleting ? "Deleting…" : "Delete app"}
        </Button>
      </section>

      <TeardownOverlay active={deleting} label="Tearing down the sandbox and Neon project…" />

      {/* Portaled: survives whatever surface hosts the sections. */}
      <ConfirmDialog
        confirmLabel="Hold to delete"
        description={
          <>
            This tears down the sandbox and permanently deletes the{" "}
            <span className="font-mono text-xs">{proto.neonProjectId ?? "tenant"}</span> Neon
            project — code, database, and every checkpoint. There is no undo.
          </>
        }
        onConfirm={destroy}
        onOpenChange={setConfirmOpen}
        open={confirmOpen}
        title={`Delete “${proto.name}”?`}
      />
    </>
  );
}

/**
 * Which Neon org tier this app's project lives in, and the one-click
 * cross-org upgrade. Payment is mocked for the demo — a real platform
 * would charge (e.g. Stripe) before performing the org transfer.
 */
function PlanSection({
  proto,
  onUpdated,
}: {
  proto: Prototype;
  onUpdated: (proto: Prototype) => void;
}) {
  const [upgrading, setUpgrading] = useState(false);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function upgrade() {
    setUpgrading(true);
    setUpgradeError(null);
    try {
      await new Promise((r) => setTimeout(r, 900));
      const updated = await client.prototypes.upgrade({ id: proto.id });
      onUpdated(updated);
      setOpen(false);
      toast.success("Upgraded — project transferred to the paid Neon org.");
    } catch (e) {
      setUpgradeError(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <section className="min-w-0">
      <div className="flex items-center justify-between">
        <p className="font-medium text-foreground text-xs">Plan</p>
        <PlanBadge plan={proto.plan === "paid" ? "paid" : "free"} />
      </div>
      {proto.status === "ready" && proto.plan === "free" && (
        <>
          <Button
            className="mt-3 w-full"
            onClick={() => setOpen(true)}
            size="sm"
            variant="secondary"
          >
            <ArrowUpCircle /> Upgrade to Paid
          </Button>
          <UpgradeDialog
            description="Move this app to the Neon Agent Program paid org — unlocking metered, billing-aligned usage."
            error={upgradeError}
            isProcessing={upgrading}
            onOpenChange={setOpen}
            onUpgrade={upgrade}
            open={open}
            plan={{
              features: [
                "Database moved to the paid Neon org",
                "Per-project usage metering",
                "Your data & connection string are preserved",
              ],
              name: "Paid",
              note: "Demo only — no real charge. This mocks the payment, then performs a real Neon cross-org project transfer.",
              price: 5,
            }}
          />
        </>
      )}
    </section>
  );
}
