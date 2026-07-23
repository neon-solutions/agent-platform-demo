import { useQueryClient } from "@tanstack/react-query";
import { ArrowUpCircle, Check, Copy } from "lucide-react";
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
import { ConnectionString } from "@/components/connection-string/connection-string";
import { TeardownOverlay } from "@/components/teardown-overlay";
import { client, orpc } from "@/utils/orpc";

/**
 * One infrastructure identifier: quiet label, mono value, copy affordance
 * that flips to a check for a beat. The ids users paste into the Neon
 * console, the API, or a support thread.
 */
function IdRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex min-w-0 items-center gap-2 py-1" data-slot="id-row">
      <span className="w-24 shrink-0 text-muted-foreground text-xs">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-foreground/90 text-xs" title={value}>
        {value}
      </span>
      <Button
        aria-label={`Copy ${label}`}
        className="size-6"
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        size="icon-sm"
        variant="ghost"
      >
        {copied ? (
          <Check aria-hidden className="size-3 text-primary" />
        ) : (
          <Copy aria-hidden className="size-3" />
        )}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? `${label} copied` : ""}
      </span>
    </div>
  );
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
        <p className="mb-1.5 font-medium text-foreground text-xs">Connection string</p>
        {proto.databaseUrl ? (
          <ConnectionString value={proto.databaseUrl} />
        ) : (
          <p className="text-muted-foreground text-xs">Available once provisioning completes.</p>
        )}
        <p className="mt-1.5 text-muted-foreground/70 text-xs">
          Pooled, straight to this app&rsquo;s own Neon Postgres project.
        </p>
      </section>

      {/* Identifiers: the coordinates of this app's infrastructure. */}
      <section className="min-w-0">
        <p className="mb-1 font-medium text-foreground text-xs">Identifiers</p>
        <div className="divide-y divide-border/40">
          <IdRow label="App ID" value={proto.id} />
          {proto.neonProjectId ? <IdRow label="Neon project" value={proto.neonProjectId} /> : null}
          {proto.neonBranchId ? <IdRow label="Neon branch" value={proto.neonBranchId} /> : null}
          {proto.neonOrgId ? <IdRow label="Neon org" value={proto.neonOrgId} /> : null}
          {proto.sandboxId ? <IdRow label="Sandbox" value={proto.sandboxId} /> : null}
        </div>
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
