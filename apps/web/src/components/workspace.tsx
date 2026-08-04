"use client";

import { useChat } from "@ai-sdk/react";
import { useQuery } from "@tanstack/react-query";
import type { Checkpoint, Prototype } from "@vibe/db/schema";
import { Button } from "@vibe/ui/components/button";
import { DefaultChatTransport } from "ai";
import { GitCommitVertical, Monitor, Settings2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AgentChat } from "@/components/agent-chat/agent-chat";
import {
  type Checkpoint as TimelineCheckpoint,
  CheckpointTimeline,
} from "@/components/checkpoint-timeline/checkpoint-timeline";
import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { AppSettingsSections } from "@/components/app-settings";
import { EmptyState } from "@/components/empty-state/empty-state";
import { ErrorDialog } from "@/components/error-dialog";

import { ThinkingModelSelect } from "@/components/thinking-model-select/thinking-model-select";
import type { ThinkingEffort } from "@/components/thinking-select/thinking-select";
import { PreviewFrame } from "@/components/preview-frame/preview-frame";
import { ProvisioningStatus } from "@/components/provisioning-status/provisioning-status";
import { UsageCard } from "@/components/usage-card/usage-card";
import { WorkspaceTabs } from "@/components/workspace-tabs/workspace-tabs";
import { useConsumptionHistory } from "@/hooks/use-consumption-history";
import {
  type ConsumptionMetricName,
  hoursBetween,
  STORAGE_METRICS,
  toAverageBytes,
} from "@/lib/consumption";
import { hasMeteredData, NOT_METERED } from "@/lib/usage";
import { type AppStatus, StatusBadge } from "@/components/status-badge/status-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@vibe/ui/components/tooltip";
import { TopNav } from "@/components/top-nav";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { client, orpc } from "@/utils/orpc";

const AGENT_URL = (process.env.NEXT_PUBLIC_AGENT_URL ?? "").replace(/\/+$/, "");
const DEFAULT_MODEL = "qwen3-next-80b-a3b-instruct";
const MODEL_STORAGE_KEY = "vibe:model";
const EFFORT_STORAGE_KEY = "vibe:effort";
const EFFORTS: ThinkingEffort[] = ["off", "minimal", "low", "medium", "high", "xhigh"];
/** Slider levels in rank order, for nearest-supported snapping. */
const EFFORT_RANK = ["minimal", "low", "medium", "high", "xhigh"] as const;
type GatewayEffort = (typeof EFFORT_RANK)[number] | "none";

/** Last model the user picked, remembered across apps and sessions. */
function storedModel(): string {
  if (typeof window === "undefined") {
    return DEFAULT_MODEL;
  }
  return window.localStorage.getItem(MODEL_STORAGE_KEY) ?? DEFAULT_MODEL;
}

/** Last reasoning effort the user picked; medium is the reasoning default. */
function storedEffort(): ThinkingEffort {
  if (typeof window === "undefined") {
    return "medium";
  }
  const raw = window.localStorage.getItem(EFFORT_STORAGE_KEY);
  return EFFORTS.includes(raw as ThinkingEffort) ? (raw as ThinkingEffort) : "medium";
}

/** The supported level closest in rank to the requested one. */
function nearestEffort(effort: ThinkingEffort, supported: string[]): ThinkingEffort | undefined {
  const levels = EFFORT_RANK.filter((level) => supported.includes(level));
  const target = EFFORT_RANK.indexOf(effort as (typeof EFFORT_RANK)[number]);
  if (levels.length === 0 || target === -1) {
    return levels[Math.floor(levels.length / 2)];
  }
  let best: ThinkingEffort | undefined;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const level of levels) {
    const distance = Math.abs(EFFORT_RANK.indexOf(level) - target);
    if (distance < bestDistance) {
      best = level;
      bestDistance = distance;
    }
  }
  return best;
}

/**
 * The wire value for a UI effort, per the model's verified support: "off"
 * sends "none" where the model can truly disable thinking (else omits),
 * unsupported levels snap to the nearest supported one.
 */
function gatewayEffort(effort: ThinkingEffort, supported: string[]): GatewayEffort | undefined {
  if (supported.length === 0) {
    return undefined;
  }
  if (effort === "off") {
    return supported.includes("none") ? "none" : undefined;
  }
  if (supported.includes(effort)) {
    return effort as GatewayEffort;
  }
  return nearestEffort(effort, supported) as GatewayEffort | undefined;
}
const POLL_MS = 2500;

/** Mint a short-lived Better Auth JWT for calling the agent directly. */
async function mintAgentToken(): Promise<string> {
  const res = await fetch("/api/auth/token", { credentials: "include" });
  if (!res.ok) {
    throw new Error("could not mint agent token");
  }
  const { token } = (await res.json()) as { token: string };
  return token;
}

export function Workspace({
  initial,
  initialPrompt,
}: {
  initial: Prototype;
  initialPrompt?: string;
}) {
  const [proto, setProto] = useState<Prototype>(initial);
  const provisioningStarted = useRef(false);

  // Kick off provisioning + poll until the sandbox is ready.
  //
  // Deps are the id alone, deliberately: each poll advances `proto.status`
  // (provisioning → booting → ready), so depending on the status would tear
  // down the loop on its own first result — the ref guard then bails on the
  // re-run and the app never learns it is ready.
  useEffect(() => {
    if (initial.status === "ready" || initial.status === "error") {
      return;
    }
    if (provisioningStarted.current) {
      return;
    }
    provisioningStarted.current = true;

    let cancelled = false;
    (async () => {
      client.prototypes.provision({ id: initial.id }).catch(() => {
        // Poll below reports the error state.
      });
      while (!cancelled) {
        await new Promise((r) => setTimeout(r, POLL_MS));
        const latest = await client.prototypes.get({ id: initial.id }).catch(() => null);
        if (cancelled || !latest) {
          continue;
        }
        setProto(latest);
        if (latest.status === "ready" || latest.status === "error") {
          break;
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id, initial.status]);

  const [turn, setTurn] = useState(0);
  // Live activity, reflected in the preview chrome: the agent editing
  // (dot breathes, app stays visible) or a checkpoint restore (covered
  // by the loader — the dev server really is restarting).
  const [agentBusy, setAgentBusy] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Settings stays a drawer; everything else is a tab now.
  const [panel, setPanel] = useState<"settings" | null>(null);
  const [tab, setTab] = useState("preview");
  // Lifted so the tab label can carry the count without the panel
  // rendering just to be counted.
  const [checkpointCount, setCheckpointCount] = useState<number | undefined>(undefined);
  // A checkpoint list that failed to load has no count to put on its label,
  // and the panel saying so is hidden behind the tab nobody opened. It has
  // to be reported on the surface the user is looking at.
  const [checkpointError, setCheckpointError] = useState<string | null>(null);

  return (
    <div className="flex h-svh flex-col">
      <TopBar proto={proto} />
      {/* Flex row so the drawer's width animation resizes the preview
          fluidly — the running app reflows live instead of being covered. */}
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="flex min-h-0 shrink-0 flex-col lg:w-[400px]">
          <ChatPanel
            initialPrompt={initialPrompt}
            onBusyChange={setAgentBusy}
            onTurnComplete={() => setTurn((t) => t + 1)}
            proto={proto}
          />
        </div>
        {/* Checkpoints are a peer of the running app, not a drawer behind
            an icon: versioning IS the story this demo tells, so it gets a
            tab of its own with its count on the label. */}
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-4">
          <WorkspaceTabs
            // Settings is scoped to the app, not to a pane: renaming or
            // tearing down is available whichever tab is open.
            actions={
              <TooltipProvider delay={300}>
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <Button
                        aria-label="App settings"
                        aria-pressed={panel === "settings"}
                        onClick={() => setPanel((p) => (p === "settings" ? null : "settings"))}
                        size="icon-sm"
                        variant="ghost"
                      >
                        <Settings2 />
                      </Button>
                    }
                  />
                  <TooltipContent className="flex-col items-start gap-0.5" side="bottom">
                    <span className="font-medium">App settings</span>
                    <span className="text-muted-foreground">
                      Rename, connection string, and teardown.
                    </span>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            }
            className="min-h-0 flex-1"
            notice={
              checkpointError ? (
                <span role="alert">
                  <span className="font-mono text-destructive">checkpoints</span>{" "}
                  {checkpointError}
                </span>
              ) : null
            }
            onValueChange={setTab}
            tabs={[
              {
                content: (
                  <div className="relative h-full">
                    <PreviewPanel
                      proto={proto}
                      refreshSignal={turn}
                      restoring={restoring}
                      working={agentBusy}
                    />
                  </div>
                ),
                icon: <Monitor className="size-3.5" />,
                id: "preview",
                // The iframe IS the running app: unmounting it on a tab
                // switch would reload the user's work.
                keepMounted: true,
                label: "preview",
              },
              {
                content: (
                  <CheckpointsPanel
                    onCountChange={setCheckpointCount}
                    onErrorChange={setCheckpointError}
                    onRestored={(p) => {
                      setProto(p);
                      setTurn((t) => t + 1);
                      // The restore's payoff is the app reverting, and that
                      // renders in the preview. Staying here would put the
                      // demo's whole point on a hidden panel.
                      setTab("preview");
                    }}
                    onRestoringChange={setRestoring}
                    proto={proto}
                    refreshSignal={turn}
                  />
                ),
                count: checkpointCount,
                countLabel: "checkpoints",
                icon: <GitCommitVertical className="size-3.5" />,
                id: "checkpoints",
                // Mounted from the start so the count is on the label
                // before the tab is ever opened — the count is the reason
                // to open it.
                keepMounted: true,
                label: "checkpoints",
              },
              {
                content: <UsagePanel proto={proto} />,
                id: "usage",
                label: "usage",
              },
            ]}
            value={tab}
          />
        </div>
        <SettingsDrawer
          onClose={() => setPanel(null)}
          onRenamed={setProto}
          open={panel === "settings"}
          proto={proto}
        />
      </div>
    </div>
  );
}

/** App settings in the workspace: same sections, drawer surface. */
function SettingsDrawer({
  proto,
  open,
  onClose,
  onRenamed,
}: {
  proto: Prototype;
  open: boolean;
  onClose: () => void;
  onRenamed: (p: Prototype) => void;
}) {
  const reduced = useReducedMotion();

  return (
    <motion.aside
      animate={{ width: open ? DRAWER.width : 0 }}
      aria-hidden={!open}
      aria-label="App settings"
      className="relative min-h-0 shrink-0 overflow-hidden"
      data-slot="settings-drawer"
      initial={false}
      transition={reduced ? { duration: 0 } : DRAWER.spring}
    >
      <div
        className="flex h-full flex-col gap-5 overflow-y-auto border-border border-l p-5"
        style={{ width: DRAWER.width }}
      >
        <div className="flex items-center justify-between">
          <p className="font-medium text-sm">App settings</p>
          <Button aria-label="Close settings" onClick={onClose} size="icon-sm" variant="ghost">
            <X />
          </Button>
        </div>
        <AppSettingsSections onRenamed={onRenamed} proto={proto} />
      </div>
    </motion.aside>
  );
}

/** Breadcrumb + identity only — workspace actions live in the toolbar. */
function TopBar({ proto }: { proto: Prototype }) {
  return (
    <TopNav>
      <span className="text-muted-foreground">/</span>
      <span className="max-w-[220px] truncate font-medium text-sm sm:max-w-[360px]">
        {proto.name}
      </span>
      <StatusBadge status={proto.status as AppStatus} />
    </TopNav>
  );
}

/* ────────────────────────────────────────────────────
 * The settings drawer slides in from the right on a spring
 * while the tabbed pane — a flex sibling — resizes fluidly
 * with it. Checkpoints and usage used to share this drawer;
 * they are tabs now.
 * ──────────────────────────────────────────────────── */
const DRAWER = {
  width: 340,
  spring: { type: "spring" as const, stiffness: 300, damping: 34 },
};

function ChatPanel({
  proto,
  onTurnComplete,
  onBusyChange,
  initialPrompt,
}: {
  proto: Prototype;
  onTurnComplete: () => void;
  onBusyChange: (busy: boolean) => void;
  initialPrompt?: string;
}) {
  const wasBusy = useRef(false);
  const modelsQuery = useQuery(orpc.models.list.queryOptions());
  const models = modelsQuery.data ?? [];
  const [model, setModel] = useState(storedModel);

  // The catalog can change (models disabled on the gateway): a remembered
  // pick that no longer exists falls back rather than silently failing —
  // to the default when the catalog still has it, else to the first
  // available model (the default id itself is just as revocable).
  useEffect(() => {
    const first = models[0]?.id;
    if (models.length === 0 || models.some((m) => m.id === model)) {
      return;
    }
    const fallback = models.some((m) => m.id === DEFAULT_MODEL) ? DEFAULT_MODEL : first;
    if (fallback) {
      setModel(fallback);
      window.localStorage.removeItem(MODEL_STORAGE_KEY);
    }
  }, [models, model]);

  function pickModel(next: string) {
    setModel(next);
    window.localStorage.setItem(MODEL_STORAGE_KEY, next);
  }
  const [effort, setEffort] = useState<ThinkingEffort>(storedEffort);
  function pickEffort(next: ThinkingEffort) {
    setEffort(next);
    window.localStorage.setItem(EFFORT_STORAGE_KEY, next);
  }
  const modelRef = useRef(model);
  modelRef.current = model;
  const selectedModel = models.find((m) => m.id === model);
  const modelName = selectedModel?.name ?? model;
  // Effective effort rides a ref so the transport closure reads it fresh.
  const effortRef = useRef<GatewayEffort | undefined>(undefined);
  effortRef.current = gatewayEffort(effort, selectedModel?.efforts ?? []);

  // Model switches can strand the remembered effort on an unsupported
  // level — snap the visible readout to what this model can actually do.
  const supportedKey = (selectedModel?.efforts ?? []).join(",");
  useEffect(() => {
    const supported = supportedKey ? supportedKey.split(",") : [];
    if (supported.length === 0 || effort === "off" || supported.includes(effort)) {
      return;
    }
    const snapped = nearestEffort(effort, supported);
    if (snapped) {
      setEffort(snapped);
    }
  }, [supportedKey, effort]);

  // Failures get the floor: the error dialog, not a toast.
  const [agentError, setAgentError] = useState<string | null>(null);

  // Runtime errors reported by the preview iframe (starter app's error
  // bridge). Held until the user sends them to the agent or dismisses.
  const [runtimeError, setRuntimeError] = useState<{
    message: string;
    detail: string;
  } | null>(null);
  const busyRef = useRef(false);
  useEffect(() => {
    function onMessage(event: MessageEvent) {
      const data = event.data as {
        type?: string;
        message?: string;
        detail?: string;
      } | null;
      if (data?.type !== "vibe:runtime-error" || !data.message) {
        return;
      }
      // Mid-turn errors are the agent's own churn — it is already on them.
      if (busyRef.current) {
        return;
      }
      setRuntimeError({ detail: data.detail ?? "", message: data.message });
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);
  const { messages, sendMessage, status, setMessages, regenerate } = useChat({
    onError: (e) => setAgentError(e.message || "Agent error"),
    transport: new DefaultChatTransport({
      api: `${AGENT_URL}/chat`,
      prepareSendMessagesRequest: async ({ messages: outgoing }) => {
        const token = await mintAgentToken();
        return {
          body: {
            messages: outgoing,
            model: modelRef.current,
            prototypeId: proto.id,
            reasoning_effort: effortRef.current,
          },
          headers: { Authorization: `Bearer ${token}` },
        };
      },
    }),
  });

  const busy = status === "submitted" || status === "streaming";
  busyRef.current = busy;
  const ready = proto.status === "ready";

  // Reload-proof chat: hydrate prior turns from the agent's memory before
  // anything sends. Auto-send waits behind this so it can't race.
  const [hydrated, setHydrated] = useState(false);
  const hydrateStarted = useRef(false);
  useEffect(() => {
    if (hydrateStarted.current || !ready) {
      return;
    }
    hydrateStarted.current = true;
    (async () => {
      try {
        const token = await mintAgentToken();
        const res = await fetch(`${AGENT_URL}/history?prototypeId=${proto.id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = (await res.json()) as { messages?: unknown[] };
          if (data.messages?.length) {
            setMessages(data.messages as Parameters<typeof setMessages>[0]);
          }
        }
      } catch {
        // No history is a fresh thread, not an error.
      } finally {
        setHydrated(true);
      }
    })();
  }, [ready, proto.id, setMessages]);

  // Prompt-first flow: the prompt typed on the landing page is auto-sent as
  // the first message once the sandbox is ready.
  const autoSent = useRef(false);
  useEffect(() => {
    if (!initialPrompt || autoSent.current || !ready || !hydrated) {
      return;
    }
    if (messages.length > 0) {
      autoSent.current = true;
      return;
    }
    autoSent.current = true;
    sendMessage({
      metadata: { model: modelRef.current, modelName },
      text: initialPrompt,
    });
    // Drop ?prompt= so a reload doesn't resend it.
    const url = new URL(window.location.href);
    url.searchParams.delete("prompt");
    window.history.replaceState(null, "", url.toString());
  }, [initialPrompt, ready, hydrated, messages.length, sendMessage, modelName]);

  // When the agent finishes a turn, refresh the preview so edits show up.
  // The preview chrome mirrors the live state while the agent works.
  useEffect(() => {
    onBusyChange(busy);
    if (busy) {
      wasBusy.current = true;
    } else if (wasBusy.current) {
      wasBusy.current = false;
      onTurnComplete();
    }
  }, [busy, onTurnComplete, onBusyChange]);

  return (
    <>
      <ErrorDialog
        error={agentError}
        onOpenChange={(open) => {
          if (!open) {
            setAgentError(null);
          }
        }}
        onRetry={() => regenerate()}
      />
      <AgentChat
        activeControls={{ model, modelName }}
        banner={
          runtimeError ? (
            <div
              className="mx-3 mb-2 flex items-center gap-2 border border-destructive/40 bg-destructive/5 px-2.5 py-1.5"
              data-slot="runtime-error-banner"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-destructive text-xs">
                {runtimeError.message}
              </span>
              <button
                className="shrink-0 border border-border/60 px-2 py-0.5 text-foreground text-xs transition-colors hover:border-border"
                onClick={() => {
                  sendMessage({
                    metadata: { model, modelName },
                    text: `The running app is showing a runtime error. Fix it.\n\nError: ${runtimeError.message}\n\n${runtimeError.detail}`,
                  });
                  setRuntimeError(null);
                }}
                type="button"
              >
                Ask agent to fix
              </button>
              <button
                aria-label="Dismiss error"
                className="shrink-0 px-1 text-muted-foreground text-xs transition-colors hover:text-foreground"
                onClick={() => setRuntimeError(null)}
                type="button"
              >
                ×
              </button>
            </div>
          ) : null
        }
        className="min-h-0 flex-1 border-border border-r"
        controls={
          models.length > 0 ? (
            <ThinkingModelSelect
              effort={effort}
              models={models}
              onEffortChange={pickEffort}
              onValueChange={pickModel}
              size="sm"
              value={model}
            />
          ) : undefined
        }
        disabled={!ready}
        emptyState={
          ready ? (
            <div className="border border-border bg-card p-4 text-muted-foreground text-sm">
              <p className="mb-2 font-medium text-foreground">Start building</p>
              Ask for features in plain language. The agent edits the live app and can checkpoint
              code and database together. Try:{" "}
              <em>
                &ldquo;Turn this into a book tracker with title, author and a read/unread
                toggle.&rdquo;
              </em>
            </div>
          ) : (
            <ProvisioningFeed proto={proto} />
          )
        }
        messages={messages}
        onSend={(text) =>
          sendMessage({
            metadata: { model, modelName },
            text,
          })
        }
        placeholder={ready ? "Describe a change…" : "Waiting for sandbox to boot…"}
        status={status}
      />
    </>
  );
}

/* ─────────────────────────────────────────────────────
 * Provisioning, told in the chat: the agent's first visible
 * work is building the infrastructure. Steps light in order
 * as statusDetail advances; the active one breathes.
 * ─────────────────────────────────────────────────── */
const PROVISION_STEPS = [
  { label: "Creating an isolated Neon Postgres project", match: "Postgres" },
  { label: "Booting the Vercel Sandbox", match: "Sandbox" },
] as const;

export function ProvisioningFeed({ proto }: { proto: Prototype }) {
  const detail = proto.statusDetail ?? "";
  const failed = proto.status === "error";
  const activeIndex = PROVISION_STEPS.findIndex((s) => detail.includes(s.match));
  const current = activeIndex === -1 ? 0 : activeIndex;

  return (
    <div className="border-border/60 border-l-2 pl-2.5" data-slot="provisioning-feed">
      <p
        className={cn(
          "py-0.5 text-xs",
          failed ? "text-destructive" : "shimmer shimmer-duration-2400 text-muted-foreground",
        )}
      >
        {failed ? "Provisioning failed" : "Provisioning your app…"}
      </p>
      <div className="mt-1 flex flex-col gap-1">
        {PROVISION_STEPS.map((step, index) => {
          const done = !failed && index < current;
          const active = !failed && index === current;
          return (
            <span
              className={cn(
                "inline-flex items-center gap-1.5 font-mono text-xs",
                done && "text-muted-foreground",
                active && "text-foreground",
                !(done || active) && "text-muted-foreground/50",
              )}
              key={step.match}
            >
              <span
                aria-hidden
                className={cn(
                  "size-1.5 shrink-0",
                  done && "bg-primary",
                  active && "neon-status-breathe bg-primary text-primary",
                  !(done || active) && "bg-muted-foreground/30",
                )}
              />
              {step.label}
            </span>
          );
        })}
      </div>
      {failed && detail && (
        <p className="mt-2 text-muted-foreground text-xs leading-relaxed">{detail}</p>
      )}
    </div>
  );
}

function PreviewPanel({
  proto,
  refreshSignal,
  working,
  restoring,
}: {
  proto: Prototype;
  refreshSignal: number;
  working: boolean;
  restoring: boolean;
}) {
  const [nonce, setNonce] = useState(0);
  const [waking, setWaking] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(proto.sandboxUrl);
  // Derived, not snapshotted: provisioning finishes AFTER mount, so the
  // polled sandboxUrl must be able to mount the frame on its own — wake()
  // then freshens the URL, it is not the gatekeeper.
  const url = liveUrl ?? proto.sandboxUrl;

  // Reload the preview iframe after each agent turn (Next.js recompiled).
  const firstSignal = useRef(true);
  useEffect(() => {
    if (firstSignal.current) {
      firstSignal.current = false;
      return;
    }
    setNonce((n) => n + 1);
  }, [refreshSignal]);

  // Sandboxes suspend/stop on their idle timeout, so opening a preview after
  // a while can 502. Wake it (resume + restart the dev server) when ready.
  const wake = useCallback(async () => {
    if (proto.status !== "ready") {
      return;
    }
    setWaking(true);
    try {
      const { url } = await client.prototypes.wake({ id: proto.id });
      setLiveUrl(url);
      setNonce((n) => n + 1);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not wake the app");
    } finally {
      setWaking(false);
    }
  }, [proto.id, proto.status]);

  useEffect(() => {
    if (proto.status === "ready") {
      wake();
    }
  }, [proto.status, wake]);

  return proto.status === "ready" && url ? (
    <PreviewFrame
      className="h-full"
      onRestart={wake}
      reloadSignal={nonce}
      src={url}
      state={restoring || waking ? "waking" : "ready"}
      title={proto.name}
      wakingLabel={restoring ? "Restoring checkpoint" : "Waking sandbox"}
      working={working}
    />
  ) : (
    <ProvisioningStatus
      className="h-full"
      detail={
        proto.statusDetail ||
        (proto.status === "error"
          ? undefined
          : "Creating a Neon Postgres project and booting a Vercel Sandbox.")
      }
      size="lg"
      state={proto.status === "error" ? "error" : "provisioning"}
      variant="bare"
    />
  );
}

function CheckpointsPanel({
  proto,
  onRestored,
  refreshSignal,
  onRestoringChange,
  onCountChange,
  onErrorChange,
}: {
  proto: Prototype;
  onRestored: (p: Prototype) => void;
  refreshSignal: number;
  onRestoringChange: (restoring: boolean) => void;
  /** Reports the count so the tab label can carry it. */
  onCountChange?: (count: number) => void;
  /** Reports a failed load, which has no count to report. */
  onErrorChange?: (error: string | null) => void;
}) {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const rows = await client.prototypes.checkpoints({ id: proto.id });
      setCheckpoints(rows);
      setLoadError(null);
      onErrorChange?.(null);
      onCountChange?.(rows.length);
    } catch {
      // A failed request is not an empty timeline. Reporting it as zero
      // checkpoints tells the user their work was never saved.
      const message = "Couldn't load checkpoints.";
      setLoadError(message);
      onErrorChange?.(message);
    }
  }, [proto.id, onCountChange, onErrorChange]);

  // Reload after each agent turn — the agent may have snapped a checkpoint.
  useEffect(() => {
    load();
  }, [load, refreshSignal]);

  async function restore(cid: string) {
    setRestoringId(cid);
    onRestoringChange(true);
    try {
      const updated = await client.prototypes.restore({
        id: proto.id,
        checkpointId: cid,
      });
      toast.success("Restored — code and database rolled back together.");
      onRestored(updated);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoringId(null);
      onRestoringChange(false);
    }
  }

  // No projectId chip here: settings already names the project, and the
  // chip would collide with the sha + snapshot pair on a narrow row.
  const rows: TimelineCheckpoint[] = checkpoints.map((c) => ({
    createdAt: relativeTime(new Date(c.createdAt)),
    id: c.id,
    label: c.label,
    sha: c.gitSha ? c.gitSha.slice(0, 7) : undefined,
    snapshot: Boolean(c.snapshotId),
  }));

  return (
    <section className="flex h-full min-h-0 flex-col">
      <p className="mb-3 text-muted-foreground text-xs">
        Every checkpoint holds the code and the database together, restored as one.
      </p>
      {/* Above the timeline rather than inside its empty slot: a refresh that
          fails after a successful load leaves rows on screen, and those rows
          are then older than they look. */}
      {loadError ? (
        <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-xs" role="alert">
          <span className="text-destructive">{loadError}</span>
          {rows.length > 0 ? (
            <span className="text-muted-foreground">Showing the last list that loaded.</span>
          ) : null}
          <button
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            onClick={() => void load()}
            type="button"
          >
            Try again
          </button>
        </p>
      ) : null}
      <CheckpointTimeline
        checkpoints={rows}
        className="min-h-0 flex-1 overflow-y-auto"
        currentId={proto.activeCheckpointId ?? undefined}
        empty={
          loadError ? (
            // "No checkpoints yet" is a measurement, and a failed request is
            // not one.
            <EmptyState
              className="h-full"
              description="Your checkpoints could not be listed. Nothing has been lost."
              title="Checkpoints unavailable"
            />
          ) : (
            <EmptyState
              className="h-full"
              description="Checkpoints capture your app and database together as the agent works."
              title="No checkpoints yet"
            />
          )
        }
        onRestore={restore}
        restoringId={restoringId}
      />
    </section>
  );
}

const USAGE_WINDOW_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * This app's own metering, on the same registry cards the account usage
 * page uses — one visual language for one number, whichever surface you
 * read it on. Scoped to this app's Neon project via the consumption proxy.
 */
function UsagePanel({ proto }: { proto: Prototype }) {
  // Stable across renders: a fresh Date would change the request key and
  // refetch forever.
  const window = useMemo(() => {
    const end = new Date();
    return {
      from: new Date(end.getTime() - USAGE_WINDOW_DAYS * DAY_MS).toISOString(),
      to: end.toISOString(),
    };
  }, []);

  const projectIds = useMemo(
    () => (proto.neonProjectId ? [proto.neonProjectId] : []),
    [proto.neonProjectId],
  );

  const { buckets, isLoading, error, refresh } = useConsumptionHistory({
    enabled: projectIds.length > 0,
    from: window.from,
    granularity: "daily",
    projectIds,
    to: window.to,
  });

  // Buckets are UTC days, so they are labelled in UTC: a local format names
  // the day before the one the bucket covers, west of Greenwich.
  const label = (start: string) =>
    new Date(start).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    });

  const samples = (metric: ConsumptionMetricName) =>
    buckets.map((bucket) => ({
      label: label(bucket.start),
      value: bucket.values[metric] ?? 0,
    }));

  /**
   * Storage metrics are byte-hours, an accumulation rather than a level:
   * handed straight to a card that formats bytes, a day of holding 1 GB
   * reads as 24 GB.
   */
  const storageSamples = () =>
    buckets.map((bucket) => ({
      label: label(bucket.start),
      value: toAverageBytes(
        STORAGE_METRICS.reduce((sum, metric) => sum + (bucket.values[metric] ?? 0), 0),
        hoursBetween(bucket.start, bucket.end),
      ),
    }));

  const metered = hasMeteredData(buckets);
  // Nothing was asked for until this app has a project, so there is nothing
  // to report as unmetered.
  const unprovisioned = projectIds.length === 0;

  return (
    <section className="max-w-3xl overflow-y-auto">
      <p className="mb-4 text-muted-foreground text-xs">
        This app&rsquo;s Neon project, last {USAGE_WINDOW_DAYS} days.{" "}
        <Link className="underline underline-offset-2 hover:text-foreground" href="/usage">
          Account usage
        </Link>
      </p>
      {error ? (
        <p className="mb-3 flex flex-wrap items-baseline gap-x-2 text-xs" role="alert">
          <span className="text-destructive">{error}</span>
          {metered ? (
            <span className="text-muted-foreground">
              Showing the last figures that loaded.
            </span>
          ) : null}
          <button
            className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
            onClick={refresh}
            type="button"
          >
            Try again
          </button>
        </p>
      ) : null}
      {isLoading || metered ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <UsageCard
              data={samples("compute_unit_seconds")}
              isLoading={isLoading}
              metric="compute"
            />
            <UsageCard
              data={storageSamples()}
              isLoading={isLoading}
              label="Storage held"
              metric="storage"
            />
            <UsageCard
              data={samples("public_network_transfer_bytes")}
              isLoading={isLoading}
              label="Public data out"
              metric="written-data"
            />
          </div>
          {error ? null : (
            <p className="mt-3 text-muted-foreground/70 text-xs leading-relaxed">
              Metering can lag after provisioning or transfer.
            </p>
          )}
        </>
      ) : error ? null : (
        // Zeros are a claim. A card reading "0 CU-hr" with an empty chart
        // well under it says "measured zero" — which is not what happened.
        <EmptyState
          description={
            unprovisioned
              ? "This app has no database yet, so there is nothing to meter."
              : NOT_METERED.description
          }
          title={unprovisioned ? "No database yet" : NOT_METERED.title}
        />
      )}
    </section>
  );
}
