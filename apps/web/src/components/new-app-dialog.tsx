import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@vibe/ui/components/dialog";
import { useState } from "react";
import { AppCreator } from "@/components/app-creator/app-creator";
import type { AppPlan } from "@/components/status-badge/status-badge";

const SUGGESTIONS = [
  "a habit tracker with streaks and a weekly heatmap",
  "an invoicing tool for freelancers with PDF export",
  "a recipe box that plans my week and writes the grocery list",
  "a link-in-bio page with click analytics",
];

/**
 * The landing composer, in a dialog: creating an app from the dashboard
 * uses the same AppCreator without leaving the page.
 */
export function NewAppDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);

  function launch(prompt: string, plan: AppPlan) {
    const trimmed = prompt.trim();
    if (!trimmed || creating) {
      return;
    }
    setCreating(true);
    router.push(`/new?prompt=${encodeURIComponent(trimmed)}&plan=${plan}`);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-w-xl gap-5 p-5">
        <DialogHeader className="gap-1">
          <DialogTitle className="text-base">New app</DialogTitle>
          <DialogDescription>
            Describe it; the agent builds it on its own Postgres database.
          </DialogDescription>
        </DialogHeader>
        <AppCreator
          actionLabel="Start building"
          isCreating={creating}
          onCreate={launch}
          placeholderPrompts={SUGGESTIONS}
          showPlans={false}
        />
      </DialogContent>
    </Dialog>
  );
}
