import { Button } from "@vibe/ui/components/button";
import { MoreHorizontal } from "lucide-react";

/**
 * The card's ⋯ trigger. ONLY a trigger: the settings dialog itself must be
 * mounted outside the card's Link (see the dashboard route) — React
 * synthetic events bubble through portals, so any dialog rendered as a
 * React child of the Link would navigate the card on click.
 */
export function ProjectCardMenu({ onOpen }: { onOpen: () => void }) {
  return (
    // oxlint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events
    <span
      onClick={(e) => {
        // Keep the trigger's click off the card link.
        e.preventDefault();
        e.stopPropagation();
      }}
      onPointerDownCapture={(e) => e.stopPropagation()}
    >
      <Button aria-label="App settings" onClick={onOpen} size="icon-xs" variant="ghost">
        <MoreHorizontal />
      </Button>
    </span>
  );
}
