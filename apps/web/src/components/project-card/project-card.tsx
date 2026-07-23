import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { AnimatedWash } from "@/components/animated-wash/animated-wash";
import type { ReactNode } from "react";
import {
  type AppPlan,
  type AppStatus,
  PlanBadge,
  StatusBadge,
} from "@/components/status-badge/status-badge";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * PROJECT CARD STORYBOARD — "a window, not a tile"
 *
 * The card IS the window: a live render of the sandbox edge
 * to edge, with the name, status, and actions floating on a
 * scrim along the bottom — chrome over glass, no furniture
 * below.
 *
 *  rest      preview at natural brightness behind a
 *            hairline; name row below
 *  hover     border warms to primary/40 (200ms); the
 *            miniature eases 2% closer (600ms ease-out)
 *            — leaning in, not jumping
 *  press     card compresses to 0.99 while held
 *  no app    (provisioning / stopped / error) the window
 *            fills with the house grain wash, tinted by
 *            state — green rising while provisioning,
 *            destructive on failure, gray asleep — with
 *            the status wording over it
 *  reduced   no lean, no compress; states still legible
 * ───────────────────────────────────────────────────────── */

/* Preview window */
const WINDOW = {
  aspect: "16/11", // a touch taller: the sill overlay needs headroom
  scale: 0.25, // iframe render scale (4x logical width)
  hoverScale: 1.02, // the lean-in on hover
  hoverEase: [0.25, 1, 0.5, 1] as const, // ease-out, unhurried
  hoverDurationS: 0.6,
};

/* Card press */
const PRESS = { scale: 0.99 };

export type ProjectCardProps = {
  name: string;
  /** One quiet line under the name — what the app is. */
  description?: string;
  status: AppStatus;
  plan: AppPlan;
  updatedAt: string;
  href: string;
  /** Live sandbox URL; rendered as a scaled miniature when present. */
  previewUrl?: string | null;
  /**
   * Card actions (e.g. a more-menu). Rendered in the name row; clicks
   * inside never navigate the card's link.
   */
  actions?: ReactNode;
  className?: string;
};

const STATUS_WORDING: Record<AppStatus, string> = {
  ready: "Live",
  provisioning: "Provisioning…",
  error: "Provisioning failed",
  stopped: "Asleep",
};

/** The wash reads currentColor: tint + tempo per state. */
const WASH: Record<
  Exclude<AppStatus, "ready">,
  { className: string; speed: number; intensity: number }
> = {
  provisioning: { className: "text-primary", speed: 1, intensity: 0.5 },
  error: { className: "text-destructive", speed: 0.25, intensity: 0.4 },
  stopped: { className: "text-muted-foreground", speed: 0, intensity: 0.3 },
};

/**
 * The dashboard's app tile as a window onto the running app: a live,
 * scaled-down render of the sandbox itself. Presentational — feed it a
 * URL and strings.
 */
export const ProjectCard = ({
  name,
  description,
  status,
  plan,
  updatedAt,
  href,
  previewUrl,
  actions,
  className,
}: ProjectCardProps) => {
  const reduced = useReducedMotion();
  const live = status === "ready" && Boolean(previewUrl);

  return (
    <motion.div className={cn("group/card", className)} whileTap={reduced ? undefined : PRESS}>
      <Link
        className="block overflow-hidden rounded-lg border border-border/60 bg-card transition-colors duration-200 hover:border-primary/40 focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/50 data-[status=error]:hover:border-primary"
        data-slot="project-card"
        data-status={status}
        href={href}
      >
        <div
          className="relative overflow-hidden bg-muted/20"
          style={{ aspectRatio: WINDOW.aspect }}
        >
          {live ? (
            <PreviewMiniature reduced={Boolean(reduced)} url={previewUrl!} />
          ) : (
            <div className="relative flex h-full items-center justify-center">
              <AnimatedWash
                aria-hidden
                className={cn(
                  "absolute inset-0 h-full w-full opacity-60",
                  WASH[status as Exclude<AppStatus, "ready">]?.className,
                )}
                intensity={WASH[status as Exclude<AppStatus, "ready">]?.intensity ?? 0.3}
                speed={WASH[status as Exclude<AppStatus, "ready">]?.speed ?? 0}
              />
              <span
                className={cn(
                  "-translate-y-4 relative text-muted-foreground text-xs",
                  status === "provisioning" && "shimmer shimmer-duration-2400",
                  status === "error" && "text-destructive",
                )}
              >
                {STATUS_WORDING[status]}
              </span>
            </div>
          )}

          {/* Chrome over glass: identity floats on a scrim at the sill. */}
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 via-background/70 to-transparent pt-8">
            <div className="flex items-center gap-2 px-3.5 pb-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-sm">{name}</p>
                {description ? (
                  <p
                    className="truncate text-muted-foreground text-xs"
                    data-slot="project-card-description"
                    title={description}
                  >
                    {description}
                  </p>
                ) : null}
                <p className="text-muted-foreground/70 text-xs">{updatedAt}</p>
              </div>
              <StatusBadge status={status} />
              <PlanBadge plan={plan} />
              {/* Actions guard their own pointer events (ProjectCardMenu):
                  a capture-phase stop here would also swallow events headed
                  for their portaled dialogs. */}
              {actions}
            </div>
          </div>
        </div>
      </Link>
    </motion.div>
  );
};

/**
 * The live miniature: the actual app in an iframe rendered at 4x logical
 * width and scaled to fit — a real window, not a screenshot. Inert to the
 * pointer; the card is the click target.
 */
function PreviewMiniature({ url, reduced }: { url: string; reduced: boolean }): ReactNode {
  const logical = 100 / WINDOW.scale; // percentage width before scaling

  return (
    <motion.div
      className="pointer-events-none absolute inset-0 origin-top-left"
      transition={{
        duration: WINDOW.hoverDurationS,
        ease: [...WINDOW.hoverEase],
      }}
      whileHover={reduced ? undefined : { scale: WINDOW.hoverScale }}
    >
      <iframe
        aria-hidden
        className="origin-top-left border-0"
        loading="lazy"
        sandbox="allow-scripts allow-same-origin"
        src={url}
        style={{
          width: `${logical}%`,
          height: `${logical}%`,
          transform: `scale(${WINDOW.scale})`,
        }}
        tabIndex={-1}
        title="App preview"
      />
    </motion.div>
  );
}
