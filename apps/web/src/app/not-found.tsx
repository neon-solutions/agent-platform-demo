import { buttonVariants } from "@vibe/ui/components/button";
import type { Metadata } from "next";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state/empty-state";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center px-6">
        <Link className="rounded-sm transition-colors hover:text-primary" href="/">
          <BrandMark />
        </Link>
      </header>
      <div className="flex flex-1 items-center justify-center px-6 pb-14">
        <EmptyState
          action={
            <div className="flex gap-2">
              <Link className={buttonVariants()} href="/app">
                Your apps
              </Link>
              <Link className={buttonVariants({ variant: "outline" })} href="/">
                Build something new
              </Link>
            </div>
          }
          className="w-full max-w-md"
          description="The page or app you're looking for doesn't exist, or it belongs to another account."
          title="Nothing here"
        />
      </div>
    </main>
  );
}
