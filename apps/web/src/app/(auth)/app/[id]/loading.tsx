import { Skeleton } from "@vibe/ui/components/skeleton";

import { BrandMark } from "@/components/brand-mark";
import { ProvisioningStatus } from "@/components/provisioning-status/provisioning-status";

/** The workspace's frame, standing in while its server render streams. */
export default function WorkspaceLoading() {
  return (
    <div aria-busy="true" className="flex h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-3 border-border border-b px-4">
        <BrandMark />
        <Skeleton className="h-4 w-48" />
      </header>
      <div className="flex min-h-0 flex-1">
        <div className="hidden w-[400px] shrink-0 flex-col gap-3 border-border border-r p-4 lg:flex">
          <Skeleton className="ml-auto h-14 w-4/5" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-2/3" />
        </div>
        <div className="flex min-w-0 flex-1 flex-col px-4 pb-4">
          <div className="flex h-9 items-center gap-4 border-border/40 border-b">
            <Skeleton className="h-3 w-14" />
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-3 w-12" />
          </div>
          <ProvisioningStatus
            className="flex-1"
            detail="Loading the workspace…"
            size="lg"
            title="Opening your app"
            variant="bare"
          />
        </div>
      </div>
    </div>
  );
}
