import { Button } from "@vibe/ui/components/button";
import { MoreHorizontal } from "lucide-react";

/**
 * The card's ⋯ trigger. ONLY a trigger: the settings dialog is mounted at
 * the route level (see the dashboard), because React synthetic events
 * bubble through portals — a dialog rendered inside the card would send its
 * clicks back through the card.
 *
 * No click guard is needed here: AppCard renders `actions` above its link
 * overlay rather than inside an anchor, so this button is a sibling of the
 * link, not a child of it.
 */
export function ProjectCardMenu({ onOpen }: { onOpen: () => void }) {
  return (
    <Button aria-label="App settings" onClick={onOpen} size="icon-xs" variant="ghost">
      <MoreHorizontal />
    </Button>
  );
}
