import * as React from "react";
import { cn } from "@/lib/utils";

const styles: Record<string, string> = {
  default: "bg-primary/15 text-primary border-primary/20",
  muted: "bg-muted text-muted-foreground border-border",
  error: "bg-destructive/15 text-destructive border-destructive/20",
};

export function Badge({
  className,
  variant = "default",
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { variant?: keyof typeof styles }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        styles[variant],
        className
      )}
      {...props}
    />
  );
}
