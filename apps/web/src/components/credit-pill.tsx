import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A quiet attribution pill: one rounded capsule on a hairline border,
 * translucent over whatever field it floats on, segments split by
 * hairline dividers. Links inside inherit the house link treatment.
 */
export function CreditPill({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        // Stacks with horizontal hairlines on small screens; becomes one
        // divided capsule from sm up.
        "inline-flex flex-col divide-y divide-border/60 rounded-2xl border border-border/60 bg-card/70 text-muted-foreground text-xs backdrop-blur-sm sm:flex-row sm:items-stretch sm:divide-x sm:divide-y-0 sm:rounded-full",
        className,
      )}
      data-slot="credit-pill"
    >
      {children}
    </div>
  );
}

export function CreditPillSegment({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        // Plain text flow (no flex): copy wraps like prose, not columns.
        "block px-3.5 py-1.5 text-center leading-relaxed sm:self-center [&_a]:text-foreground/90 [&_a]:underline-offset-4 [&_a:hover]:text-foreground [&_a:hover]:underline",
        className,
      )}
      data-slot="credit-pill-segment"
    >
      {children}
    </span>
  );
}
