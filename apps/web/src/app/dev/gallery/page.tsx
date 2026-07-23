"use client";

import { notFound } from "next/navigation";
import type { Prototype } from "@vibe/db/schema";
import { Button } from "@vibe/ui/components/button";
import { type ReactNode, useState } from "react";
import { ToolGroup } from "@/components/agent-chat/agent-chat";
import { AppCreator } from "@/components/app-creator/app-creator";
import { CheckpointTimeline } from "@/components/checkpoint-timeline/checkpoint-timeline";
import { ConfirmDialog } from "@/components/confirm-dialog/confirm-dialog";
import { ConnectionString } from "@/components/connection-string/connection-string";
import { CreditPill, CreditPillSegment } from "@/components/credit-pill";
import { ExamplePrompts } from "@/components/example-prompts";
import { MetricCard } from "@/components/metric-card/metric-card";
import { PreviewFrame } from "@/components/preview-frame/preview-frame";
import { ProjectCard } from "@/components/project-card/project-card";
import { PlanBadge, StatusBadge } from "@/components/status-badge/status-badge";
import { ToolCallChip } from "@/components/tool-call-chip/tool-call-chip";
import { TopNav } from "@/components/top-nav";
import { ProvisioningFeed } from "@/components/workspace";

/**
 * Dev-only review wall: every vibe-local composition in its key states,
 * on the real tokens and fonts, hot-reloading with the code. Not routed
 * in production.
 */
/** Dev-only: hard 404 outside development builds. */
const DEV_ONLY = process.env.NODE_ENV !== "development";

const FAKE_PROTO = {
  id: "00000000-0000-4000-8000-000000000000",
  userId: "user",
  name: "Book tracker",
  plan: "free",
  status: "provisioning",
  statusDetail: "Booting Vercel Sandbox…",
  neonOrgId: "org-winter-thunder-90669661",
  neonProjectId: "crimson-bonus-77678511",
  neonBranchId: "br-main",
  databaseUrl: "postgresql://neondb_owner:secret@ep-example.neon.tech/neondb",
  sandboxId: null,
  sandboxUrl: null,
  sandboxSnapshotUrl: null,
  createdAt: new Date(),
  updatedAt: new Date(),
} as Prototype;

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-border/60 border-t pt-8 pb-10 first:border-t-0">
      <h2 className="mb-5 font-medium text-muted-foreground text-xs">{title}</h2>
      {children}
    </section>
  );
}

function Case({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-2 font-mono text-[11px] text-muted-foreground/70">{label}</p>
      {children}
    </div>
  );
}

export default function GalleryPage() {
  if (DEV_ONLY) {
    notFound();
  }
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <div className="flex min-h-svh flex-col">
      <TopNav>
        <span className="text-muted-foreground text-sm">/ dev / gallery</span>
      </TopNav>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <h1 className="mb-8 font-semibold text-2xl tracking-tight">Component gallery</h1>

        <Section title="preview-frame — lifecycle × working">
          <div className="grid gap-4 lg:grid-cols-2">
            <Case label='state="ready"'>
              <PreviewFrame className="h-64" src="/" title="ready" />
            </Case>
            <Case label='state="ready" working'>
              <PreviewFrame className="h-64" src="/" title="working" working />
            </Case>
            <Case label='state="waking" (restore label)'>
              <PreviewFrame
                className="h-64"
                src="/"
                state="waking"
                title="waking"
                wakingLabel="Restoring checkpoint"
              />
            </Case>
            <Case label='state="sleeping"'>
              <PreviewFrame className="h-64" src="/" state="sleeping" title="sleeping" />
            </Case>
            <Case label='state="error"'>
              <PreviewFrame
                className="h-64"
                errorDetail="The dev server exited with code 1."
                src="/"
                state="error"
                title="error"
              />
            </Case>
          </div>
        </Section>

        <Section title="tool-group — agent working states">
          <div className="grid gap-6 lg:grid-cols-3">
            <Case label="working (open, shimmer)">
              <ToolGroup
                tools={[
                  { name: "listFiles", state: "done" },
                  { name: "readFile", state: "done", detail: "lib/schema.ts" },
                  { name: "writeFile", state: "running", detail: "app/page.tsx" },
                ]}
              />
            </Case>
            <Case label="done (collapsed receipt)">
              <ToolGroup
                tools={[
                  { name: "listFiles", state: "done" },
                  { name: "writeFile", state: "done", detail: "app/page.tsx" },
                  { name: "createCheckpoint", state: "done", detail: "Add books" },
                ]}
              />
            </Case>
            <Case label="with a failure">
              <ToolGroup
                tools={[
                  { name: "writeFile", state: "done", detail: "lib/db.ts" },
                  { name: "runCommand", state: "error", detail: "npm install" },
                ]}
              />
            </Case>
          </div>
        </Section>

        <Section title="provisioning-feed — chat during provisioning">
          <div className="grid gap-6 lg:grid-cols-3">
            <Case label="step 1 active">
              <ProvisioningFeed
                proto={{ ...FAKE_PROTO, statusDetail: "Provisioning Neon Postgres…" }}
              />
            </Case>
            <Case label="step 2 active">
              <ProvisioningFeed proto={FAKE_PROTO} />
            </Case>
            <Case label="failed">
              <ProvisioningFeed
                proto={{
                  ...FAKE_PROTO,
                  status: "error",
                  statusDetail: "project quota exceeded for org",
                }}
              />
            </Case>
          </div>
        </Section>

        <Section title="project-card — window states">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <ProjectCard
              href="/dev/gallery"
              name="Live app with a long name that truncates"
              plan="paid"
              previewUrl="/"
              status="ready"
              updatedAt="2m ago"
            />
            <ProjectCard
              href="/dev/gallery"
              name="Provisioning"
              plan="free"
              status="provisioning"
              updatedAt="just now"
            />
            <ProjectCard
              href="/dev/gallery"
              name="Failed"
              plan="free"
              status="error"
              updatedAt="1h ago"
            />
          </div>
        </Section>

        <Section title="metric-card — dashboard states">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              comparisonLabel="last 14 days"
              label="apps"
              trend={[1, 1, 2, 2, 3, 3, 3, 4, 5, 5, 6, 6, 7, 8]}
              value={8}
            />
            <MetricCard label="running" value={3} />
            <MetricCard isLoading label="loading" value={0} />
            <MetricCard error="usage unavailable" label="errored" value={0} />
          </div>
        </Section>

        <Section title="checkpoint-timeline — rail width">
          <div className="max-w-[320px]">
            <CheckpointTimeline
              checkpoints={[
                {
                  createdAt: "just now",
                  id: "1",
                  label: "Add read/unread toggle",
                  sha: "dda2810",
                  snapshot: true,
                },
                {
                  createdAt: "14m ago",
                  id: "2",
                  label: "Book tracker scaffold",
                  sha: "91c4f2a",
                  snapshot: true,
                },
              ]}
              onRestore={() => undefined}
              restoringId={null}
            />
          </div>
        </Section>

        <Section title="chips, badges, pills">
          <div className="flex flex-wrap items-center gap-4">
            <ToolCallChip detail="app/page.tsx" name="writeFile" state="running" />
            <ToolCallChip detail="lib/db.ts" name="readFile" state="done" />
            <ToolCallChip detail="npm install" name="runCommand" state="error" />
            <StatusBadge status="ready" />
            <StatusBadge status="provisioning" />
            <StatusBadge status="error" />
            <PlanBadge plan="free" />
            <PlanBadge plan="paid" />
          </div>
          <div className="mt-5">
            <CreditPill>
              <CreditPillSegment>
                A reference app for the <a href="https://neon.com/agents">Neon Agent Program</a>
              </CreditPillSegment>
              <CreditPillSegment>
                Built with <a href="https://ui.neon.com">neon ui</a> + @neon/sdk
              </CreditPillSegment>
            </CreditPill>
          </div>
        </Section>

        <Section title="composer + example prompts">
          <div className="max-w-2xl">
            <AppCreator
              onCreate={() => undefined}
              placeholderPrompts={["a habit tracker with streaks"]}
            />
            <ExamplePrompts
              className="mt-6"
              onPick={() => undefined}
              prompts={[
                { label: "Habit tracker", prompt: "a habit tracker" },
                { label: "Invoicing", prompt: "an invoicing tool" },
                { label: "Book club", prompt: "a book club app" },
                { label: "Workout log", prompt: "a workout log" },
                { label: "Plant journal", prompt: "a plant care journal" },
                { label: "Expense splitter", prompt: "an expense splitter" },
              ]}
            />
          </div>
        </Section>

        <Section title="connection-string — masked / revealed / unparseable">
          <div className="max-w-xl space-y-3">
            <Case label="masked (default)">
              <ConnectionString value="postgresql://neondb_owner:s3cr3t-p4ss@ep-ancient-forest-ajg1nm4b-pooler.c-3.us-east-2.aws.neon.tech/neondb?sslmode=require" />
            </Case>
            <Case label="revealed">
              <ConnectionString
                defaultRevealed
                value="postgresql://neondb_owner:s3cr3t-p4ss@ep-ancient-forest.neon.tech/neondb"
              />
            </Case>
            <Case label="not URL-shaped (fully masked)">
              <ConnectionString value="host=1.2.3.4 password=hunter2" />
            </Case>
          </div>
        </Section>

        <Section title="confirm-dialog — hold to arm">
          <Button onClick={() => setConfirmOpen(true)} variant="outline">
            Open confirm dialog
          </Button>
          <ConfirmDialog
            confirmLabel="Hold to delete"
            description="Gallery rehearsal — confirming does nothing."
            onConfirm={() => undefined}
            onOpenChange={setConfirmOpen}
            open={confirmOpen}
            title="Delete “Book tracker”?"
          />
        </Section>
      </main>
    </div>
  );
}
