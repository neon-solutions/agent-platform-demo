"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Streamdown } from "streamdown";
import {
  ArrowLeft,
  RefreshCw,
  RotateCw,
  RotateCcw,
  ArrowUpCircle,
  BarChart3,
  ExternalLink,
  Send,
  Wrench,
  Database,
  GitBranch,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Prototype, Checkpoint } from "@/lib/db/schema";

const AGENT_URL = process.env.NEXT_PUBLIC_AGENT_URL || "";

export function Workspace({ initial }: { initial: Prototype }) {
  const [proto, setProto] = useState<Prototype>(initial);
  const provisioningStarted = useRef(false);

  // Kick off provisioning + poll until the sandbox is ready.
  useEffect(() => {
    if (proto.status === "ready") return;
    if (proto.status === "error") return;
    if (provisioningStarted.current) return;
    provisioningStarted.current = true;

    let cancelled = false;
    (async () => {
      fetch(`/api/prototypes/${proto.id}/provision`, { method: "POST" }).catch(() => {});
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, 2500));
        const res = await fetch(`/api/prototypes/${proto.id}`);
        if (!res.ok) continue;
        const data = await res.json();
        if (cancelled) return;
        setProto(data.prototype);
        if (data.prototype.status === "ready" || data.prototype.status === "error") break;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proto.id, proto.status]);

  return (
    <div className="flex h-screen flex-col">
      <TopBar proto={proto} onUpdated={setProto} />
      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr]">
        <ChatPanel proto={proto} />
        <PreviewPanel proto={proto} onUpdated={setProto} />
      </div>
    </div>
  );
}

function TopBar({ proto, onUpdated }: { proto: Prototype; onUpdated: (p: Prototype) => void }) {
  const [upgrading, setUpgrading] = useState(false);

  async function upgrade() {
    setUpgrading(true);
    try {
      const res = await fetch(`/api/prototypes/${proto.id}/upgrade`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upgrade failed");
      onUpdated(data.prototype);
      toast.success("Upgraded — project transferred to the paid Neon org.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upgrade failed");
    } finally {
      setUpgrading(false);
    }
  }

  return (
    <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href="/app">
            <ArrowLeft /> Apps
          </Link>
        </Button>
        <span className="font-medium">{proto.name}</span>
        <Badge variant={proto.status === "ready" ? "default" : proto.status === "error" ? "error" : "muted"}>
          {proto.status}
        </Badge>
        <Badge variant="muted">
          <Database className="mr-1 size-3" /> {proto.plan} db
        </Badge>
      </div>
      <div className="flex items-center gap-2">
        {proto.status === "ready" && proto.plan === "free" && (
          <Button
            variant="secondary"
            size="sm"
            onClick={upgrade}
            disabled={upgrading}
            title="Transfer this app's Neon project from the free org to the paid org"
          >
            {upgrading ? <Loader2 className="animate-spin" /> : <ArrowUpCircle />} Upgrade to Paid
          </Button>
        )}
        {proto.sandboxUrl && (
          <Button asChild variant="outline" size="sm">
            <a href={proto.sandboxUrl} target="_blank" rel="noreferrer">
              Open <ExternalLink />
            </a>
          </Button>
        )}
      </div>
    </header>
  );
}

function ChatPanel({ proto }: { proto: Prototype }) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({
      api: `${AGENT_URL}/chat`,
      prepareSendMessagesRequest: async ({ messages }) => {
        const res = await fetch(`/api/prototypes/${proto.id}/token`);
        const { token } = await res.json();
        return {
          headers: { Authorization: `Bearer ${token}` },
          body: { messages, prototypeId: proto.id },
        };
      },
    }),
    onError: (e) => toast.error(e.message || "Agent error"),
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const busy = status === "submitted" || status === "streaming";
  const ready = proto.status === "ready";

  const submit = useCallback(() => {
    const text = input.trim();
    if (!text || busy || !ready) return;
    sendMessage({ text });
    setInput("");
  }, [input, busy, ready, sendMessage]);

  return (
    <div className="flex min-h-0 flex-col border-r border-border">
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
            <p className="mb-2 font-medium text-foreground">Start vibe-coding 👋</p>
            Ask the agent to build features. It edits the live app in your sandbox and can
            snapshot code + database as checkpoints. Try: <em>&ldquo;Turn this into a book
            tracker with title, author and a read/unread toggle.&rdquo;</em>
          </div>
        )}
        {messages.map((m) => (
          <MessageBubble key={m.id} role={m.role} parts={m.parts} />
        ))}
        {busy && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Agent is working…
          </div>
        )}
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={ready ? "Describe a change…" : "Waiting for sandbox to boot…"}
            disabled={!ready}
            className="flex-1 resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <Button onClick={submit} disabled={!ready || busy} size="icon">
            <Send />
          </Button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ role, parts }: { role: string; parts: unknown[] }) {
  const isUser = role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground"
            : "max-w-[92%] space-y-2 text-sm"
        }
      >
        {(parts as Array<Record<string, unknown>>).map((part, i) => {
          const type = String(part.type);
          if (type === "text") {
            const text = String(part.text ?? "");
            return isUser ? (
              <span key={i}>{text}</span>
            ) : (
              <div key={i} className="prose prose-invert max-w-none prose-p:my-1 prose-pre:my-2">
                <Streamdown>{text}</Streamdown>
              </div>
            );
          }
          if (type.startsWith("tool-")) {
            const name = type.slice("tool-".length);
            const state = typeof part.state === "string" ? part.state : "";
            const done = state === "output-available";
            return (
              <div
                key={i}
                className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs text-muted-foreground"
              >
                {done ? <Wrench className="size-3 text-primary" /> : <Loader2 className="size-3 animate-spin" />}
                <span className="font-mono">{name}</span>
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

function PreviewPanel({ proto, onUpdated }: { proto: Prototype; onUpdated: (p: Prototype) => void }) {
  const [tab, setTab] = useState<"preview" | "checkpoints" | "usage">("preview");
  const [nonce, setNonce] = useState(0);
  const [waking, setWaking] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(proto.sandboxUrl);

  // Sandboxes suspend/stop on their idle timeout, so opening a preview after a
  // while can 502. Wake it (resume + restart the dev server) when ready.
  const wake = useCallback(async () => {
    if (proto.status !== "ready") return;
    setWaking(true);
    try {
      const res = await fetch(`/api/prototypes/${proto.id}/wake`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not wake the app");
      setLiveUrl(data.url);
      setNonce((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not wake the app");
    } finally {
      setWaking(false);
    }
  }, [proto.id, proto.status]);

  useEffect(() => {
    if (proto.status === "ready") wake();
  }, [proto.status, wake]);

  return (
    <div className="flex min-h-0 flex-col bg-black/20">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <div className="flex gap-1">
          <TabButton active={tab === "preview"} onClick={() => setTab("preview")}>
            Preview
          </TabButton>
          <TabButton active={tab === "checkpoints"} onClick={() => setTab("checkpoints")}>
            Checkpoints
          </TabButton>
          <TabButton active={tab === "usage"} onClick={() => setTab("usage")}>
            Usage
          </TabButton>
        </div>
        {tab === "preview" && proto.status === "ready" && (
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" onClick={wake} disabled={waking} title="Resume the sandbox & restart the dev server">
              <RotateCw className={waking ? "animate-spin" : ""} /> Restart
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setNonce((n) => n + 1)} disabled={waking}>
              <RefreshCw /> Refresh
            </Button>
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1">
        {tab === "preview" ? (
          proto.status !== "ready" ? (
            <ProvisioningState proto={proto} />
          ) : waking && !liveUrl ? (
            <WakingState />
          ) : liveUrl ? (
            <iframe
              key={nonce}
              src={liveUrl}
              className="h-full w-full border-0 bg-white"
              title="App preview"
            />
          ) : (
            <WakingState />
          )
        ) : tab === "checkpoints" ? (
          <CheckpointsPanel
            proto={proto}
            onRestored={(updated) => {
              onUpdated(updated);
              setTab("preview");
              wake();
            }}
          />
        ) : (
          <UsagePanel proto={proto} />
        )}
      </div>
    </div>
  );
}

function WakingState() {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="size-6 animate-spin text-primary" />
        <p className="text-sm">Waking the sandbox…</p>
        <p className="text-xs">Resuming the VM and starting the dev server.</p>
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        "rounded-md px-3 py-1.5 text-sm transition-colors " +
        (active ? "bg-secondary text-secondary-foreground" : "text-muted-foreground hover:text-foreground")
      }
    >
      {children}
    </button>
  );
}

function ProvisioningState({ proto }: { proto: Prototype }) {
  return (
    <div className="grid h-full place-items-center p-8 text-center">
      {proto.status === "error" ? (
        <div className="max-w-md">
          <p className="mb-2 font-medium text-destructive">Provisioning failed</p>
          <p className="text-sm text-muted-foreground">{proto.statusDetail}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="size-6 animate-spin text-primary" />
          <p className="text-sm">{proto.statusDetail || "Provisioning your app…"}</p>
          <p className="text-xs">Creating a Neon Postgres project and booting a Vercel Sandbox.</p>
        </div>
      )}
    </div>
  );
}

function CheckpointsPanel({
  proto,
  onRestored,
}: {
  proto: Prototype;
  onRestored: (p: Prototype) => void;
}) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/prototypes/${proto.id}/checkpoints`);
      const data = await res.json();
      setCheckpoints(data.checkpoints ?? []);
    } finally {
      setLoading(false);
    }
  }, [proto.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function restore(cid: string) {
    setRestoringId(cid);
    try {
      const res = await fetch(`/api/prototypes/${proto.id}/checkpoints/${cid}/restore`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Restore failed");
      toast.success("Restored — code and database rolled back together.");
      onRestored(data.prototype);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="max-w-md text-sm text-muted-foreground">
          A compound checkpoint binds the code (git commit), the database (Neon snapshot),
          and the runnable surface. Restoring rolls back all of it together.
        </p>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {checkpoints.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          No checkpoints yet. Ask the agent to &ldquo;save a checkpoint&rdquo; after a change.
        </p>
      ) : (
        <ul className="space-y-2">
          {checkpoints.map((c) => (
            <li key={c.id} className="rounded-lg border border-border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium">{c.label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {new Date(c.createdAt).toLocaleString()}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => restore(c.id)}
                    disabled={restoringId !== null}
                    title="Reset code + database to this checkpoint"
                  >
                    {restoringId === c.id ? (
                      <Loader2 className="animate-spin" />
                    ) : (
                      <RotateCcw />
                    )}
                    Restore
                  </Button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span className="inline-flex items-center gap-1" title="Source revision (git commit)">
                  <GitBranch className="size-3" /> {c.gitSha ? c.gitSha.slice(0, 7) : "—"}
                </span>
                <span className="inline-flex items-center gap-1" title="Database state (Neon snapshot)">
                  <Database className="size-3" /> {c.snapshotId ? "snapshot" : "no snapshot"}
                </span>
                {c.neonProjectId && (
                  <span className="font-mono opacity-70" title="Tenant Neon project">
                    {c.neonProjectId}
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const METRIC_LABELS: Record<string, string> = {
  compute_unit_seconds: "Compute (CU·s)",
  root_branch_bytes_month: "Root branch storage (byte·mo)",
  child_branch_bytes_month: "Child branch storage (byte·mo)",
  snapshot_storage_bytes_month: "Snapshot storage (byte·mo)",
  public_network_transfer_bytes: "Egress (bytes)",
};

function formatMetric(key: string, value: number): string {
  if (key === "compute_unit_seconds") return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  if (key.includes("bytes")) {
    const mb = value / (1024 * 1024);
    return mb < 1024 ? `${mb.toFixed(1)} MB` : `${(mb / 1024).toFixed(2)} GB`;
  }
  return value.toLocaleString();
}

interface Usage {
  from: string;
  to: string;
  projectId: string;
  plan: string;
  metrics: Record<string, number>;
}

function UsagePanel({ proto }: { proto: Prototype }) {
  const [usage, setUsage] = useState<Usage | null>(null);
  const [planGated, setPlanGated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setPlanGated(false);
    try {
      const res = await fetch(`/api/prototypes/${proto.id}/usage`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not load usage");
      setPlanGated(Boolean(data.planGated));
      setUsage(data.usage);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load usage");
    } finally {
      setLoading(false);
    }
  }, [proto.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="max-w-md text-sm text-muted-foreground">
          Billing-aligned consumption for this app&rsquo;s isolated Neon project (last 30 days,
          v2 per-project metrics) — how a metered fleet bills each tenant.
        </p>
        <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={loading ? "animate-spin" : ""} /> Refresh
        </Button>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading usage…
        </div>
      ) : error ? (
        <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          {error}
        </p>
      ) : planGated ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          <p className="mb-1 font-medium text-foreground">Metering is a paid-plan feature</p>
          Billing-aligned consumption (v2 per-project metrics) is available on Launch plans and
          above. This app&rsquo;s database is on the free org — use <em>Upgrade to Paid</em> to move
          it to the paid org and unlock per-tenant usage.
        </div>
      ) : usage ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {Object.keys(METRIC_LABELS).map((key) => (
            <div key={key} className="rounded-lg border border-border bg-card p-4">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <BarChart3 className="size-3" /> {METRIC_LABELS[key]}
              </div>
              <div className="mt-1 text-xl font-semibold">
                {formatMetric(key, usage.metrics[key] ?? 0)}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
