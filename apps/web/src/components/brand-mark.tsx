import { cn } from "@/lib/utils";

/** The Vibe wordmark: a primary diamond and the name. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex items-center gap-2 font-semibold text-sm", className)}>
      <svg aria-hidden className="size-3 text-primary" fill="currentColor" viewBox="0 0 12 12">
        <path d="M6 0 12 6 6 12 0 6Z" />
      </svg>
      Vibe
    </span>
  );
}
