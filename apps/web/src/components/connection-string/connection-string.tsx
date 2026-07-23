import { Check, Copy, Eye, EyeOff } from "lucide-react";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Button } from "@vibe/ui/components/button";
import { cn } from "@/lib/utils";

/* ─────────────────────────────────────────────────────────
 * CONNECTION STRING STORYBOARD — "credentials, composed"
 *
 * One mono line on a quiet surface. The secret is the only
 * hidden part: scheme, role, host, and database stay
 * readable so the string is scannable without a reveal.
 *
 *  rest      password renders as five bullets in muted ink;
 *            everything else in foreground mono
 *  reveal    eye toggles the real secret in place — no
 *            layout shift, the row is already sized by
 *            truncation
 *  copy      always copies the REAL string. The glyph swaps
 *            to a primary check for 1.5s and a polite
 *            aria-live note says "copied" — then back
 *  no parse  a value that isn't a URL masks entirely rather
 *            than leaking
 * ───────────────────────────────────────────────────────── */

const COPY_FLASH_MS = 1500;
const MASK = "•••••";

export type ConnectionStringProps = Omit<ComponentProps<"div">, "children"> & {
  /** The full connection string; copy always uses this. */
  value: string;
  /** Start revealed (defaults to masked). */
  defaultRevealed?: boolean;
  /** Notified after a successful copy. */
  onCopy?: () => void;
};

interface Parsed {
  head: string; // scheme + role, up to the password
  password: string;
  tail: string; // @host/db?params
}

/** Split so only the password needs hiding. Null when not URL-shaped. */
function parse(value: string): Parsed | null {
  try {
    const url = new URL(value);
    if (!url.password) {
      return null;
    }
    const head = `${url.protocol}//${decodeURIComponent(url.username)}:`;
    const tail = value.slice(value.indexOf("@"));
    return { head, password: decodeURIComponent(url.password), tail };
  } catch {
    return null;
  }
}

/**
 * A tenant database credential as a first-class object: readable ends,
 * hidden secret, reveal in place, and a copy that always carries the
 * real value.
 */
export const ConnectionString = ({
  value,
  defaultRevealed = false,
  onCopy,
  className,
  ...props
}: ConnectionStringProps) => {
  const [revealed, setRevealed] = useState(defaultRevealed);
  const [copied, setCopied] = useState(false);
  const parsed = parse(value);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FLASH_MS);
    onCopy?.();
  }

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1 rounded-md border border-border/60 bg-muted/20 py-1 pr-1 pl-2.5 transition-colors focus-within:border-border hover:border-border",
        className,
      )}
      data-revealed={revealed || undefined}
      data-slot="connection-string"
      {...props}
    >
      <code
        className="min-w-0 flex-1 truncate font-mono text-[11px] leading-relaxed"
        data-slot="connection-string-value"
      >
        {parsed ? (
          <>
            {parsed.head}
            <span
              className={cn(!revealed && "text-muted-foreground")}
              data-slot="connection-string-secret"
            >
              {revealed ? parsed.password : MASK}
            </span>
            {parsed.tail}
          </>
        ) : revealed ? (
          value
        ) : (
          MASK
        )}
      </code>
      <Button
        aria-label={revealed ? "Hide password" : "Reveal password"}
        aria-pressed={revealed}
        onClick={() => setRevealed((r) => !r)}
        size="icon-xs"
        variant="ghost"
      >
        {revealed ? <EyeOff /> : <Eye />}
      </Button>
      <Button aria-label="Copy connection string" onClick={copy} size="icon-xs" variant="ghost">
        {copied ? <Check className="text-primary" /> : <Copy />}
      </Button>
      <span aria-live="polite" className="sr-only">
        {copied ? "Connection string copied" : ""}
      </span>
    </div>
  );
};
