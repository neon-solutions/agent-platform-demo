"use client";

import { Button, buttonVariants } from "@vibe/ui/components/button";
import { TriangleAlert } from "lucide-react";
import Link from "next/link";

import { BrandMark } from "@/components/brand-mark";
import { EmptyState } from "@/components/empty-state/empty-state";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
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
              <Button onClick={reset}>Try again</Button>
              <Link className={buttonVariants({ variant: "outline" })} href="/app">
                Your apps
              </Link>
            </div>
          }
          className="w-full max-w-md"
          description={
            <>
              {error.message || "An unexpected error stopped this page from loading."}
              {error.digest ? (
                <span className="mt-2 block font-mono text-[11px] text-muted-foreground/70">
                  ref {error.digest}
                </span>
              ) : null}
            </>
          }
          icon={<TriangleAlert className="text-destructive" />}
          role="alert"
          title="This page failed to load"
        />
      </div>
    </main>
  );
}
