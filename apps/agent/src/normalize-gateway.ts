/**
 * Some gateway routes (gpt-oss-*, qwen35-*) return `message.content` /
 * `delta.content` as an ARRAY of blocks instead of the chat-completions
 * string shape (verified against the live gateway 2026-07-22):
 *
 *   [{ type: "reasoning", summary: [{ type: "summary_text", text }] },
 *    { type: "text", text }]
 *
 * The AI SDK's chat-completions parser rejects that mid-stream
 * (AI_TypeValidationError). This wraps global fetch and flattens those
 * arrays on the way back: text blocks join into the `content` string,
 * reasoning summaries join into `reasoning_content` (the DeepSeek-style
 * field the openai-compatible provider already reads). String-shaped
 * responses pass through untouched, so well-behaved models cost one
 * content-type check.
 */

const BASE = (process.env.NEON_AI_GATEWAY_BASE_URL ?? "").replace(/\/+$/, "");

interface ContentBlock {
  type?: string;
  text?: string;
  summary?: { type?: string; text?: string }[];
}

interface MessageBearer {
  content?: unknown;
  reasoning_content?: unknown;
}

interface ChatPayload {
  choices?: { message?: MessageBearer; delta?: MessageBearer }[];
}

/** Split an array-shaped content into its text and reasoning strings. */
function flatten(content: unknown): { text: string; reasoning: string } | null {
  if (!Array.isArray(content)) {
    return null;
  }
  let text = "";
  let reasoning = "";
  for (const block of content as ContentBlock[]) {
    if (block?.type === "text" && typeof block.text === "string") {
      text += block.text;
    } else if (block?.type === "reasoning") {
      for (const part of block.summary ?? []) {
        if (typeof part?.text === "string") {
          reasoning += part.text;
        }
      }
    }
  }
  return { text, reasoning };
}

function normalizeBearer(bearer: MessageBearer | undefined): void {
  const flat = flatten(bearer?.content);
  if (!(bearer && flat)) {
    return;
  }
  bearer.content = flat.text;
  if (flat.reasoning) {
    const existing = typeof bearer.reasoning_content === "string" ? bearer.reasoning_content : "";
    bearer.reasoning_content = existing + flat.reasoning;
  }
}

/** Flatten every choice's message and delta, in place. */
export function normalizePayload(payload: ChatPayload): void {
  for (const choice of payload?.choices ?? []) {
    normalizeBearer(choice.message);
    normalizeBearer(choice.delta);
  }
}

/** Normalize one SSE line; non-data and unparsable lines pass through. */
export function normalizeSseLine(line: string): string {
  if (!line.startsWith("data:")) {
    return line;
  }
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") {
    return line;
  }
  try {
    const payload = JSON.parse(data) as ChatPayload;
    normalizePayload(payload);
    return `data: ${JSON.stringify(payload)}`;
  } catch {
    return line;
  }
}

/** Line-buffered SSE rewrite — data lines can split across net chunks. */
function normalizeSse(body: ReadableStream<Uint8Array>): ReadableStream<Uint8Array> {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = "";
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          controller.enqueue(encoder.encode(`${normalizeSseLine(line)}\n`));
        }
      },
      flush(controller) {
        if (buffer) {
          controller.enqueue(encoder.encode(normalizeSseLine(buffer)));
        }
      },
    }),
  );
}

/** Response headers minus the ones invalidated by rewriting the body. */
function rewrittenHeaders(response: Response): Headers {
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.delete("content-encoding");
  return headers;
}

let installed = false;

/** Wrap global fetch once; only gateway chat-completions responses are touched. */
export function installGatewayNormalizer(): void {
  if (installed || !BASE) {
    return;
  }
  installed = true;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const response = await original(input as never, init);
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!(url.startsWith(BASE) && url.includes("/chat/completions") && response.ok)) {
      return response;
    }
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream") && response.body) {
      return new Response(normalizeSse(response.body), {
        headers: rewrittenHeaders(response),
        status: response.status,
        statusText: response.statusText,
      });
    }
    if (contentType.includes("application/json")) {
      const payload = (await response.json()) as ChatPayload;
      normalizePayload(payload);
      return new Response(JSON.stringify(payload), {
        headers: rewrittenHeaders(response),
        status: response.status,
        statusText: response.statusText,
      });
    }
    return response;
  };
}
