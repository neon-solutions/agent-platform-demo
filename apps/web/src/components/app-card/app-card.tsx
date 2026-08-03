"use client";

import { ArrowUpRightIcon } from "lucide-react";
import type { ComponentProps, ReactNode } from "react";

import { PlanBadge, StatusBadge } from "@/components/status-badge/status-badge";
import type { AppPlan, AppStatus } from "@/components/status-badge/status-badge";
import { cn } from "@vibe/ui/lib/utils";

export type AppCardProps = Omit<ComponentProps<"a">, "children"> & {
  /** App name, shown in mono. */
  name: string;
  /** Lifecycle state, rendered as a StatusBadge. */
  status: AppStatus;
  /** Billing plan, rendered as a PlanBadge. */
  plan?: AppPlan;
  /** One-line summary of what the app does. */
  description?: string;
  /** Last activity, already formatted, e.g. "2h ago". */
  updatedAt?: string;
  /**
   * Controls that live INSIDE the card but outside its link — a menu,
   * a stop button. Rendered in the top-right corner, above the link
   * overlay, so clicking one never navigates.
   */
  actions?: ReactNode;
  /**
   * Status-colored grain rising from the bottom edge. Pass a ReactNode
   * (e.g. a Paper Shaders GrainGradient) to replace the built-in CSS grain
   * inside the same positioned, status-tinted slot.
   */
  wash?: boolean | ReactNode;
};

/** Wash tint per status: color only ever comes from the vocabulary. */
const STATUS_WASH: Record<AppStatus, string> = {
  error: "text-destructive",
  provisioning: "text-primary",
  ready: "text-primary",
  stopped: "text-muted-foreground",
};

/* ─────────────────────────────────────────────────────────
 * The dashboard grid card, on MetricCard's shell: hairline
 * border warming on hover with a neon underline sweeping in
 * under the name (transform-only, no layout shift). The
 * corner arrow inks in alongside; the status vocabulary
 * anchors the foot with the timestamp opposite.
 *
 * The card is a link WITHOUT being an <a> wrapper: the
 * anchor is a stretched overlay, so `actions` can sit above
 * it in the same corner and stay clickable. A nested button
 * inside an anchor is both invalid HTML and unreachable —
 * the anchor swallows the click.
 * ───────────────────────────────────────────────────────── */
export const AppCard = ({
  actions,
  className,
  description,
  name,
  plan,
  status,
  updatedAt,
  wash = true,
  ...props
}: AppCardProps) => (
  <div
    className={cn(
      "group relative isolate flex min-h-[128px] select-none flex-col overflow-hidden rounded-lg border border-border/60 bg-card p-4 shadow-none ring-0 transition-colors hover:border-border focus-within:border-primary",
      className,
    )}
    data-slot="app-card"
    data-status={status}
  >
    {wash === true ? (
      <div
        aria-hidden="true"
        className={cn(
          "neon-card-wash -z-10 pointer-events-none absolute inset-x-0 bottom-0 h-24 opacity-[0.07] transition-opacity duration-500 group-hover:opacity-[0.22]",
          STATUS_WASH[status],
        )}
      />
    ) : null}
    {wash && wash !== true ? (
      <div
        aria-hidden="true"
        className={cn(
          "-z-10 pointer-events-none absolute inset-x-0 bottom-0 h-24 overflow-hidden",
          STATUS_WASH[status],
        )}
        data-slot="app-card-wash"
      >
        {wash}
      </div>
    ) : null}
    {/* The whole card is the hit area, minus whatever `actions` covers. */}
    <a
      aria-label={name}
      className="absolute inset-0 z-0 cursor-pointer rounded-lg focus-visible:outline-none"
      data-slot="app-card-link"
      {...props}
    />
    {actions ? (
      <div className="absolute top-3 right-3 z-20" data-slot="app-card-actions">
        {actions}
      </div>
    ) : null}
    {/* pointer-events-none keeps the text out of the link's way while
        leaving it selectable-looking; the overlay owns every click. */}
    <div className="pointer-events-none relative z-10 flex min-w-0 flex-col">
      <div className={cn("flex items-center gap-1.5", actions && "pr-8")}>
        <p
          className="relative min-w-0 truncate font-mono font-semibold text-foreground text-sm after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-primary after:transition-transform after:duration-300 after:ease-out group-hover:after:scale-x-100 motion-reduce:after:transition-none"
          title={name}
        >
          {name}
        </p>
        <ArrowUpRightIcon
          aria-hidden="true"
          className="size-3.5 shrink-0 text-muted-foreground/40 transition-colors group-hover:text-foreground"
        />
      </div>
      {description ? (
        <p className="mt-1.5 line-clamp-2 max-w-[48ch] text-pretty text-muted-foreground/80 text-xs leading-5">
          {description}
        </p>
      ) : null}
    </div>
    <div className="pointer-events-none relative z-10 mt-auto flex items-center gap-1.5 pt-4">
      <StatusBadge status={status} />
      {plan ? <PlanBadge plan={plan} /> : null}
      {updatedAt ? (
        <span className="ml-auto whitespace-nowrap font-mono text-[10px] text-muted-foreground/70 tabular-nums">
          {updatedAt}
        </span>
      ) : null}
    </div>
  </div>
);
