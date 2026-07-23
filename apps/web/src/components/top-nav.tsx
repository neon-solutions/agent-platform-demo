import Link from "next/link";
import type { ReactNode } from "react";
import UserMenu from "@/components/user-menu";

/**
 * The one authed chrome: mark -> /app on the left, contextual content in the
 * middle (app name, status, actions), user menu on the right. Pages compose
 * it instead of rolling their own headers.
 */
export function TopNav({
  children,
  actions,
}: {
  /** Contextual content next to the mark (app name, status badge). */
  children?: ReactNode;
  /** Right-aligned contextual actions, rendered before the user menu. */
  actions?: ReactNode;
}) {
  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-border border-b px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          className="flex items-center gap-2 font-semibold text-sm transition-colors hover:text-primary"
          href="/app"
        >
          <span className="text-primary text-xs">◆</span> Vibe
        </Link>
        {children}
      </div>
      <div className="flex items-center gap-2">
        {actions}
        <UserMenu />
      </div>
    </header>
  );
}
