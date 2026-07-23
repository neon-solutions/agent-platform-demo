"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Prototype } from "@vibe/db/schema";
import { AppSettingsDialog } from "@/components/app-settings-dialog";
import { Button } from "@vibe/ui/components/button";
import { useState } from "react";
import { NewAppDialog } from "@/components/new-app-dialog";
import { ProjectCard } from "@/components/project-card/project-card";
import { ProjectCardMenu } from "@/components/project-card-menu";
import { EmptyState } from "@/components/empty-state/empty-state";
import { MetricCard } from "@/components/metric-card/metric-card";
import type { AppPlan, AppStatus } from "@/components/status-badge/status-badge";
import { TopNav } from "@/components/top-nav";
import { relativeTime } from "@/lib/format";
import { orpc } from "@/utils/orpc";

const KNOWN_STATUSES: AppStatus[] = ["ready", "provisioning", "error", "stopped"];

function toStatus(status: string): AppStatus {
  return KNOWN_STATUSES.includes(status as AppStatus) ? (status as AppStatus) : "stopped";
}

const TREND_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Cumulative app count per day over the trend window — honest data only. */
function appsTrend(createdAts: Date[]): number[] {
  const now = Date.now();
  return Array.from({ length: TREND_DAYS }, (_, i) => {
    const dayEnd = now - (TREND_DAYS - 1 - i) * DAY_MS;
    return createdAts.filter((d) => d.getTime() <= dayEnd).length;
  });
}

/**
 * Fleet-at-a-glance for one account: every app is its own Neon project, so
 * the summary is a tenant-fleet readout in miniature, built from the house
 * MetricCard (loading, error, and trend states included).
 */
function SummaryStrip({
  total,
  ready,
  paid,
  trend,
  isLoading,
  error,
}: {
  total: number;
  ready: number;
  paid: number;
  trend: number[];
  isLoading: boolean;
  error: Error | null;
}) {
  // One connected row: the container owns the frame, cells share hairlines.
  const cell = "rounded-none border-0";
  const shared = { error, isLoading };
  return (
    <section className="mb-8 grid divide-x divide-y divide-border border border-border sm:grid-cols-2 lg:grid-cols-4 lg:divide-y-0">
      <MetricCard
        {...shared}
        className={cell}
        comparisonLabel={`last ${TREND_DAYS} days`}
        label="apps"
        trend={trend}
        value={total}
      />
      <MetricCard {...shared} className={cell} label="running" value={ready} />
      <MetricCard {...shared} className={cell} label="free plan" value={total - paid} />
      <MetricCard {...shared} className={cell} label="paid plan" value={paid} />
    </section>
  );
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [newAppOpen, setNewAppOpen] = useState(false);
  // The one settings dialog for every card, mounted OUTSIDE the card links
  // (portaled dialogs bubble React events through their tree). `open` is
  // tracked separately so the delete confirm survives the dialog closing.
  const [settings, setSettings] = useState<{
    proto: Prototype;
    open: boolean;
  } | null>(null);
  const prototypes = useQuery({
    ...orpc.prototypes.list.queryOptions(),
    // Live while anything is in flight: a provisioning card polls itself
    // to ready (or error) instead of sitting stale until a manual refresh.
    refetchInterval: (query) =>
      query.state.data?.some((p) => p.status === "provisioning") ? 3000 : false,
  });

  function refreshList() {
    queryClient.invalidateQueries({
      queryKey: orpc.prototypes.list.queryOptions().queryKey,
    });
  }
  const rows = prototypes.data ?? [];
  const ready = rows.filter((p) => p.status === "ready").length;
  const paid = rows.filter((p) => p.plan === "paid").length;
  const trend = appsTrend(rows.map((p) => new Date(p.createdAt)));

  return (
    <div className="flex min-h-svh flex-col">
      <TopNav>
        <span className="text-muted-foreground text-sm">/ Your apps</span>
      </TopNav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <header className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-2xl tracking-tight">Your apps</h1>
            <p className="mt-1 text-muted-foreground text-sm">
              Each app runs on its own Neon Postgres project.
            </p>
          </div>
          <Button onClick={() => setNewAppOpen(true)}>
            <span className="group-hover/button:shimmer shimmer-duration-1600">New app</span>
          </Button>
        </header>

        {(rows.length > 0 || prototypes.isLoading) && (
          <SummaryStrip
            error={prototypes.error}
            isLoading={prototypes.isLoading}
            paid={paid}
            ready={ready}
            total={rows.length}
            trend={trend}
          />
        )}

        {rows.length === 0 && !prototypes.isLoading ? (
          <EmptyState
            action={
              <Button onClick={() => setNewAppOpen(true)} size="sm">
                New app
              </Button>
            }
            description="Describe one and the agent builds it, database included."
            title="No apps yet"
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((p) => (
              <ProjectCard
                actions={<ProjectCardMenu onOpen={() => setSettings({ open: true, proto: p })} />}
                description={p.description ?? undefined}
                href={`/app/${p.id}`}
                key={p.id}
                name={p.name}
                plan={p.plan as AppPlan}
                previewUrl={p.sandboxUrl}
                status={toStatus(p.status)}
                updatedAt={relativeTime(new Date(p.createdAt))}
              />
            ))}
          </div>
        )}
      </main>
      <NewAppDialog onOpenChange={setNewAppOpen} open={newAppOpen} />
      {settings && (
        <AppSettingsDialog
          key={settings.proto.id}
          onDeleted={() => {
            setSettings(null);
            refreshList();
          }}
          onOpenChange={(open) => setSettings((s) => (s ? { ...s, open } : s))}
          onRenamed={refreshList}
          open={settings.open}
          proto={settings.proto}
        />
      )}
    </div>
  );
}
