import { Button } from "@vibe/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@vibe/ui/components/dialog";
import { Check, Copy } from "lucide-react";
import { useState } from "react";

const COPY_FLASH_MS = 1500;

interface ParsedError {
  headline: string;
  /** Plain-language cause and what to do. */
  explanation: string;
  /** Pretty technical payload for the details pane. */
  details: string;
}

const STATUS_EXPLANATIONS: Record<number, string> = {
  401: "The session token was rejected. Sign out and back in, then retry.",
  429: "The model provider is rate limiting. Give it a moment and retry.",
  502: "The AI gateway couldn't reach the model provider. This is usually temporary — retrying often succeeds.",
  503: "The model provider is unavailable right now. Retry in a moment.",
};

/**
 * Gateway-specific causes, matched against the raw payload — more precise
 * than the status code alone (both TPM and the daily cap arrive as 429).
 */
/** Titles are one line; the payload pane holds the rest. */
const HEADLINE_MAX = 100;

function clipHeadline(text: string): string {
  const firstLine = text.split("\n")[0] ?? text;
  return firstLine.length > HEADLINE_MAX ? `${firstLine.slice(0, HEADLINE_MAX - 1)}…` : firstLine;
}

const PAYLOAD_EXPLANATIONS: Array<{ match: RegExp; explanation: string }> = [
  {
    match: /TPM limit exceeded/i,
    explanation:
      "The AI Gateway's beta rate limit: 200,000 tokens per minute across the account (input + output). It resets within the minute — wait briefly and retry.",
  },
  {
    match: /REQUEST_LIMIT_EXCEEDED/i,
    explanation:
      "The account's daily AI Gateway spend cap is exhausted — every gateway request returns 429 until it resets, even though beta inference is free. Retrying now won't help; try again later or ask Neon to lift the cap.",
  },
  {
    match: /not available on the chat_completions endpoint/i,
    explanation:
      "This model only serves the Responses API, which the agent can't reach through the OpenAI-compatible endpoint. Pick a different model from the list.",
  },
  {
    match: /AI_TypeValidationError|expected string, received array/i,
    explanation:
      "The model streamed a response shape the agent's SDK can't parse (reasoning blocks instead of plain text) — a known gateway beta quirk with some models. Switch models and retry; the picker only offers verified ones now.",
  },
];

/** Agent errors arrive as JSON blobs or plain strings; read both. */
function parseAgentError(message: string): ParsedError {
  try {
    const data = JSON.parse(message) as {
      name?: string;
      message?: string;
      statusCode?: number;
      url?: string;
    };
    const status = data.statusCode;
    return {
      headline: clipHeadline(
        [
          data.name ?? "Agent error",
          status ? `(${status})` : "",
          "—",
          data.message ?? "request failed",
        ]
          .filter((part) => part !== "")
          .join(" "),
      ),
      explanation:
        PAYLOAD_EXPLANATIONS.find((rule) => rule.match.test(message))?.explanation ??
        (status ? STATUS_EXPLANATIONS[status] : undefined) ??
        "The agent's request failed. The details below say exactly where.",
      details: JSON.stringify(data, null, 2),
    };
  } catch {
    return {
      headline: "Agent error",
      explanation:
        PAYLOAD_EXPLANATIONS.find((rule) => rule.match.test(message))?.explanation ??
        "The agent's request failed. The details below say exactly where.",
      details: message,
    };
  }
}

/**
 * The big error surface: failures get the floor, not a toast. Plain
 * language first, full technical payload scrollable below, copyable,
 * with retry as the primary way out.
 */
export function ErrorDialog({
  error,
  onOpenChange,
  onRetry,
}: {
  /** The raw error message; null renders nothing. */
  error: string | null;
  onOpenChange: (open: boolean) => void;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (error === null) {
    return null;
  }
  const parsed = parseAgentError(error);

  async function copyDetails() {
    await navigator.clipboard.writeText(parsed.details);
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPY_FLASH_MS);
  }

  return (
    <Dialog onOpenChange={onOpenChange} open>
      <DialogContent className="flex max-h-[85svh] w-[92vw] max-w-3xl flex-col gap-4 p-5">
        <DialogHeader className="gap-1.5">
          <DialogTitle className="text-base">
            {/* Filled chip, not bare red text — the tag reads as a
                classification, the headline stays the loudest line. */}
            <span className="mr-2 inline-block rounded-[3px] bg-destructive px-1.5 py-0.5 align-[2px] font-mono font-semibold text-destructive-foreground text-xs leading-none">
              error
            </span>
            {parsed.headline}
          </DialogTitle>
          <DialogDescription className="text-sm">{parsed.explanation}</DialogDescription>
        </DialogHeader>

        <div className="relative min-h-0 flex-1 overflow-hidden rounded-md border border-border/60 bg-muted/20">
          <Button
            aria-label="Copy error details"
            className="absolute top-2 right-2 z-10"
            onClick={copyDetails}
            size="icon-sm"
            variant="ghost"
          >
            {copied ? <Check className="text-primary" /> : <Copy />}
          </Button>
          <pre className="h-full overflow-auto p-3 pr-12 font-mono text-muted-foreground text-xs leading-relaxed">
            {parsed.details}
          </pre>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant="ghost">
            Dismiss
          </Button>
          {onRetry && (
            <Button
              onClick={() => {
                onOpenChange(false);
                onRetry();
              }}
            >
              Try again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
