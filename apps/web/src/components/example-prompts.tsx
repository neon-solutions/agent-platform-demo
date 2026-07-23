import { RefreshCw } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * ANIMATION STORYBOARD — "deal a new hand"
 *
 * Read top-to-bottom. Each `at` value is ms after trigger.
 *
 * mount:
 *     0ms   chips deal in — fade + rise 8px, spring
 *           (staggered 50ms, left to right)
 * shuffle (click "Try an example"):
 *     0ms   refresh icon spins 180°
 *     0ms   outgoing chips fall — fade + drop 6px (all at once)
 *   120ms   incoming chips deal in (staggered 50ms)
 * pick (click a chip):
 *           press scales chip 0.97 while held; prompt lands
 *           in the composer on release
 * reduced motion: instant swaps, no deal, no spin
 * ───────────────────────────────────────────────────────── */

const TIMING = {
  dealStagger: 50, // ms between each incoming chip
  outDuration: 120, // ms for the outgoing hand to fall
};

/* Chips */
const CHIP = {
  dealOffsetY: 8, // px chips rise from when dealt
  dropOffsetY: 6, // px chips fall when dismissed
  pressScale: 0.97, // scale while a chip is held down
  spring: { type: "spring" as const, stiffness: 420, damping: 32 },
};

/* Shuffle control */
const SHUFFLE = {
  iconSpinDeg: 180, // per shuffle
  spring: { type: "spring" as const, stiffness: 300, damping: 26 },
};

const HAND_SIZE = 3;

export interface ExamplePrompt {
  /** Short idea shown on the chip, e.g. "Habit tracker". */
  label: string;
  /** Full sentence dropped into the composer. */
  prompt: string;
}

/**
 * Rotating example prompts under the composer. Three chips at a time;
 * the shuffle deals a new hand from the pool. Picking one hands the
 * full prompt to the composer — editable, never auto-launched.
 */
export function ExamplePrompts({
  prompts,
  onPick,
  className,
}: {
  prompts: ExamplePrompt[];
  onPick: (prompt: string) => void;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const [hand, setHand] = useState(0);
  const [spins, setSpins] = useState(0);
  const hands = Math.max(1, Math.ceil(prompts.length / HAND_SIZE));
  const visible = prompts.slice(hand * HAND_SIZE, hand * HAND_SIZE + HAND_SIZE);

  return (
    <div className={cn("flex flex-col items-center gap-3", className)}>
      <button
        className="group inline-flex items-center gap-1.5 text-muted-foreground text-xs transition-colors hover:text-foreground"
        onClick={() => {
          setHand((h) => (h + 1) % hands);
          setSpins((s) => s + 1);
        }}
        type="button"
      >
        Try an example
        <motion.span
          animate={reduced ? undefined : { rotate: spins * SHUFFLE.iconSpinDeg }}
          className="inline-flex"
          transition={SHUFFLE.spring}
        >
          <RefreshCw aria-hidden className="size-3" />
        </motion.span>
      </button>

      <div className="flex min-h-9 flex-wrap justify-center gap-2">
        <AnimatePresence initial={false} mode="popLayout">
          {visible.map((example, index) => (
            <motion.button
              animate={{ opacity: 1, y: 0 }}
              className="rounded-md border border-border/60 bg-card/60 px-3.5 py-1.5 text-muted-foreground text-sm backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground"
              exit={
                reduced
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      y: CHIP.dropOffsetY,
                      transition: { duration: TIMING.outDuration / 1000 },
                    }
              }
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: CHIP.dealOffsetY }}
              key={example.label}
              onClick={() => onPick(example.prompt)}
              transition={{
                ...CHIP.spring,
                delay: reduced ? 0 : (index * TIMING.dealStagger) / 1000,
              }}
              type="button"
              whileTap={reduced ? undefined : { scale: CHIP.pressScale }}
            >
              {example.label}
            </motion.button>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
