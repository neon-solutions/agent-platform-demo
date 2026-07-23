import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { NeonLoader } from "@/components/neon-loader/neon-loader";

/* ─────────────────────────────────────────────────────────
 * TEARDOWN OVERLAY STORYBOARD
 *
 * Deleting infrastructure is not a background job the user
 * should click through. While it runs the whole screen
 * steps back: a dark scrim takes the page (250ms fade),
 * the loader resolves in the center over one shimmering
 * status line. Nothing underneath is clickable. The scrim
 * lifts only when the work is done (or failed — the toast
 * speaks, the screen returns).
 * ───────────────────────────────────────────────────────── */
const FADE_S = 0.25;

export function TeardownOverlay({
  active,
  label,
}: {
  active: boolean;
  /** One line of what is being torn down. */
  label: string;
}) {
  // Portal to the body: the host surface may be a closed (hidden) dialog
  // or a collapsed drawer by the time teardown runs — the scrim must not
  // inherit that. Mount-gated for SSR.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) {
    return null;
  }

  return createPortal(
    <AnimatePresence>
      {active && (
        <motion.div
          animate={{ opacity: 1 }}
          aria-busy="true"
          aria-live="polite"
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-background/85 backdrop-blur-sm"
          data-slot="teardown-overlay"
          exit={{ opacity: 0 }}
          initial={{ opacity: 0 }}
          role="status"
          transition={{ duration: FADE_S, ease: "easeOut" }}
        >
          <NeonLoader label={label} size={28} />
          <p className="shimmer shimmer-duration-2400 font-mono text-muted-foreground text-xs">
            {label}
          </p>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
