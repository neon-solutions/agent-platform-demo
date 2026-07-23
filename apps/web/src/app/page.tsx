"use client";

import { motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, useRef, useState } from "react";
import { AppCreator } from "@/components/app-creator/app-creator";
import { AuthDialog } from "@/components/auth-dialog";
import { HalftoneBloom } from "@/components/halftone-bloom/halftone-bloom";
import { CreditPill, CreditPillSegment } from "@/components/credit-pill";
import { ExamplePrompts } from "@/components/example-prompts";
import type { AppPlan } from "@/components/status-badge/status-badge";
import { authClient } from "@/lib/auth-client";

const SUGGESTIONS = [
  "a habit tracker with streaks and a weekly heatmap",
  "an invoicing tool for freelancers with PDF export",
  "a recipe box that plans my week and writes the grocery list",
  "a link-in-bio page with click analytics",
];

/** Chip label + the full prompt it deals into the composer. */
const EXAMPLES = [
  {
    label: "Habit tracker",
    prompt: "a habit tracker with streaks and a weekly heatmap",
  },
  {
    label: "Freelance invoicing",
    prompt: "an invoicing tool for freelancers with PDF export",
  },
  {
    label: "Book club",
    prompt: "a book club app with polls and a reading schedule",
  },
  {
    label: "Workout log",
    prompt: "a workout log that charts personal records over time",
  },
  {
    label: "Plant care journal",
    prompt: "a plant care journal with watering reminders",
  },
  {
    label: "Expense splitter",
    prompt: "an expense splitter for roommates with a settle-up view",
  },
  {
    label: "Job tracker",
    prompt: "a job application tracker with stages and notes",
  },
  {
    label: "Meal planner",
    prompt: "a recipe box that plans my week and writes the grocery list",
  },
  {
    label: "Link in bio",
    prompt: "a link-in-bio page with click analytics",
  },
];

/**
 * The prompt-first front door: describing an app IS the onboarding. Auth and
 * provisioning happen after the prompt, not before.
 */
export default function HomePage() {
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const [launching, setLaunching] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"sign-in" | "sign-up">("sign-up");
  // The launch the user asked for before auth interrupted, resumed after.
  const pending = useRef<{ prompt: string; plan: AppPlan } | null>(null);

  function go(prompt: string, plan: AppPlan) {
    setLaunching(true);
    router.push(`/new?prompt=${encodeURIComponent(prompt)}&plan=${plan}`);
  }

  function launch(prompt: string, plan: AppPlan) {
    const trimmed = prompt.trim();
    if (!trimmed || launching) {
      return;
    }
    if (session) {
      go(trimmed, plan);
      return;
    }
    // Not signed in: keep the prompt on screen, auth in place, then resume.
    pending.current = { prompt: trimmed, plan };
    setAuthMode("sign-up");
    setAuthOpen(true);
  }

  const [prompt, setPrompt] = useState("");

  const composer = (
    <>
      <AppCreator
        actionLabel="Start building"
        isCreating={launching}
        onCreate={launch}
        onPromptChange={setPrompt}
        placeholderPrompts={SUGGESTIONS}
        prompt={prompt}
        showPlans={false}
      />
      <ExamplePrompts className="mt-6" onPick={setPrompt} prompts={EXAMPLES} />
    </>
  );

  const header = (
    <header className="relative z-10 flex h-14 items-center justify-between px-6">
      <span className="flex items-center gap-2 font-semibold text-sm">
        <span className="text-primary text-xs">◆</span> Vibe
      </span>
      <nav>
        {session ? (
          <Link
            className="px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            href="/app"
          >
            Your apps
          </Link>
        ) : (
          <button
            className="px-3 py-1.5 text-muted-foreground text-sm transition-colors hover:text-foreground"
            onClick={() => {
              pending.current = null;
              setAuthMode("sign-in");
              setAuthOpen(true);
            }}
            type="button"
          >
            Sign in
          </button>
        )}
      </nav>
    </header>
  );

  return (
    <>
      <Horizon composer={composer} header={header} />

      <AuthDialog
        defaultMode={authMode}
        key={authMode}
        onAuthed={() => {
          setAuthOpen(false);
          const p = pending.current;
          if (p) {
            go(p.prompt, p.plan);
          } else {
            window.location.assign("/app");
          }
        }}
        onOpenChange={setAuthOpen}
        open={authOpen}
      />
    </>
  );
}

function FooterLine({ className = "" }: { className?: string }) {
  return (
    <footer className={`relative ${className}`}>
      <div className="flex justify-center px-6 py-5">
        <CreditPill>
          <CreditPillSegment>
            A reference app for the{" "}
            <a href="https://neon.com/agents" rel="noreferrer noopener" target="_blank">
              Neon Agent Program
            </a>
          </CreditPillSegment>
          <CreditPillSegment>
            Built with{" "}
            <a href="https://ui.neon.com" rel="noreferrer noopener" target="_blank">
              neon ui
            </a>{" "}
            + @neon/sdk
          </CreditPillSegment>
        </CreditPill>
      </div>
    </footer>
  );
}

/* ────────────────────────────────────────────────────────────
 * Horizon, alive.
 *
 * STORYBOARD "quiet horizon"
 *   entrance (once):
 *     headline   fade + rise 16px + unblur, spring, t=0
 *     subcopy    same, t=+90ms
 *     composer   fade + rise 12px, t=+180ms
 *     horizon    fade in over 1.4s ease-out
 *   reduced motion: plain fade entrance, static field.
 * ──────────────────────────────────────────────────────────── */
const ENTRANCE_SPRING = { type: "spring", stiffness: 320, damping: 34 } as const;

function Horizon({ header, composer }: { header: ReactNode; composer: ReactNode }) {
  const reduced = useReducedMotion();

  const enter = (delay: number) =>
    reduced
      ? { initial: { opacity: 0 }, animate: { opacity: 1 } }
      : {
          initial: { opacity: 0, y: 16, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { ...ENTRANCE_SPRING, delay },
        };

  return (
    <main className="relative flex min-h-svh flex-col overflow-hidden">
      <motion.div
        animate={{ opacity: 0.75 }}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[30vh]"
        initial={{ opacity: 0 }}
        style={{
          maskImage: "linear-gradient(to top, black 0%, black 20%, transparent 95%)",
          WebkitMaskImage: "linear-gradient(to top, black 0%, black 20%, transparent 95%)",
        }}
        transition={{ duration: 1.4, ease: "easeOut" }}
      >
        <HalftoneBloom className="h-full w-full" speed={1.6} />
      </motion.div>
      {header}
      <section className="relative mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-6 pb-[18vh]">
        <motion.h1
          className="text-center font-semibold text-5xl tracking-tighter sm:text-6xl"
          {...enter(0)}
        >
          What should we build?
        </motion.h1>
        <motion.p
          className="mx-auto mt-4 max-w-md text-center text-base text-muted-foreground leading-relaxed"
          {...enter(0.09)}
        >
          Describe an app. An agent codes it live, on its own Postgres database, in seconds.
        </motion.p>
        <motion.div className="mt-10" {...enter(0.18)}>
          {composer}
        </motion.div>
      </section>
      <FooterLine className="bg-gradient-to-t from-background/90 to-transparent" />
    </main>
  );
}
