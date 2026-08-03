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
 *
 * The states are explicit rather than inherited from `ghost`: that variant
 * hovers to `bg-muted/50`, which against the card's own surface is nearly
 * the same color — a hover you have to look for is not a hover. So:
 *
 *   rest      dim glyph, no chrome. The card's own hover already says
 *             "interactive"; this doesn't need to shout underneath it
 *   card      the glyph brightens as soon as the pointer is anywhere on
 *   hover     the card, so the target announces itself before you aim
 *   hover     a real surface arrives (foreground/10 reads on card, in
 *             both themes) and the glyph goes full-strength
 *   open      the surface stays while the dialog is open, so it is
 *             obvious which card you are editing
 */
export function ProjectCardMenu({ onOpen }: { onOpen: () => void }) {
  return (
    <Button
      aria-label="App settings"
      className="text-muted-foreground/50 transition-colors group-hover:text-muted-foreground hover:bg-foreground/10 hover:text-foreground focus-visible:text-foreground aria-expanded:bg-foreground/10 aria-expanded:text-foreground dark:hover:bg-foreground/10"
      onClick={onOpen}
      size="icon-xs"
      variant="ghost"
    >
      <MoreHorizontal />
    </Button>
  );
}
