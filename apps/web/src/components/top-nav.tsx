"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { BrandMark } from "@/components/brand-mark";
import UserMenu from "@/components/user-menu";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "/app", label: "Apps" },
  { href: "/usage", label: "Usage" },
] as const;

function PrimaryNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex h-full items-center gap-1">
      {LINKS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex h-full items-center px-2.5 text-sm transition-colors",
              "after:absolute after:inset-x-2.5 after:bottom-0 after:h-px after:bg-primary after:opacity-0 after:transition-opacity",
              active
                ? "text-foreground after:opacity-100"
                : "text-muted-foreground hover:text-foreground",
            )}
            href={href}
            key={href}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * The one authed chrome: mark -> /app on the left, then either the primary
 * nav or, inside an app, that app's breadcrumb; user menu on the right.
 */
export function TopNav({
  children,
  actions,
}: {
  /** Contextual breadcrumb (app name, status badge); replaces the primary nav. */
  children?: ReactNode;
  /** Right-aligned contextual actions, rendered before the user menu. */
  actions?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 flex h-12 shrink-0 items-center gap-3 border-border border-b bg-background/90 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <Link
        aria-label="Vibe, your apps"
        className="shrink-0 rounded-sm transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-ring"
        href="/app"
      >
        <BrandMark />
      </Link>
      <div className="flex h-full min-w-0 flex-1 items-center gap-2">
        {children ?? <PrimaryNav />}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {actions}
        <UserMenu />
      </div>
    </header>
  );
}
