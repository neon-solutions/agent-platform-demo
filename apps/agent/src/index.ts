import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createUIMessageStreamResponse } from "ai";
import { handleChatStream } from "@mastra/ai-sdk";
import { toAISdkMessages } from "@mastra/ai-sdk/ui";
import { getMastra, CODER_AGENT_ID, memory } from "./mastra";
import { installGatewayNormalizer } from "./normalize-gateway";

// Flatten array-shaped gateway responses (gpt-oss-*, qwen35-*) before the
// AI SDK parses them — must wrap fetch before any model call happens.
installGatewayNormalizer();
import { getPrototypeForUser } from "./db";

/**
 * The coding agent, hosted as a long-running Neon Function next to the
 * control-plane Postgres. The browser calls it directly with a short-lived
 * Better Auth JWT (verified here against the app's JWKS), so the app server is
 * never in the path of the long agent stream.
 */
const AUTH_BASE_URL = process.env.AUTH_BASE_URL ?? "";
const jwks = AUTH_BASE_URL ? createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/auth/jwks`)) : null;

async function authUserId(req: Request): Promise<string | null> {
  const header = req.headers.get("authorization");
  if (!header || !header.toLowerCase().startsWith("bearer ") || !jwks) return null;
  try {
    const { payload } = await jwtVerify(header.slice(7), jwks, {
      issuer: AUTH_BASE_URL,
      audience: AUTH_BASE_URL,
    });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["authorization", "content-type"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    maxAge: 86400,
  }),
);

app.get("/health", (c) => c.json({ ok: true }));

/**
 * Prior turns for a prototype's thread, shaped for useChat — the browser
 * hydrates its chat from here so a reload keeps the conversation.
 */
app.get("/history", async (c) => {
  const userId = await authUserId(c.req.raw);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const prototypeId = c.req.query("prototypeId");
  if (!prototypeId) return c.json({ error: "prototypeId required" }, 400);

  const proto = await getPrototypeForUser(prototypeId, userId);
  if (!proto) return c.json({ error: "prototype not found" }, 404);

  try {
    const { messages } = await memory.recall({
      threadId: prototypeId,
      resourceId: userId,
    });
    return c.json({ messages: toAISdkMessages(messages, { version: "v6" }) });
  } catch {
    // No thread yet (fresh app) — an empty history, not an error.
    return c.json({ messages: [] });
  }
});

app.post("/chat", async (c) => {
  const userId = await authUserId(c.req.raw);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const body = await c.req.json<{
    messages?: unknown[];
    prototypeId?: string;
    model?: string;
    reasoning_effort?: string;
  }>();
  // Gateway model override from the composer's ModelSelect; short ids only.
  // Clamp models the agent can't run — responses-only, broken routes, or
  // array-shaped streaming — to the env default: stale clients (cached
  // pickers, old localStorage) must never resurrect a broken model.
  // (gpt-5* non-codex re-verified green 2026-07-22; gpt-oss-*/qwen35-*
  // array streaming handled by the gateway normalizer. Keep in sync with
  // packages/api/src/routers/models.ts UNCHATTABLE.)
  const DENIED = [
    /-codex/,
    /^gemini-/, // 3.x: thoughtSignature stripped by the AI SDK breaks tool loops
  ];
  const requested =
    typeof body.model === "string" && /^[\w.-]+$/.test(body.model) ? body.model : undefined;
  const model =
    requested && !DENIED.some((rule) => rule.test(requested)) ? `neon/${requested}` : undefined;
  // Reasoning effort from the composer's ThinkingSelect — the client sends
  // a value verified against the model's supported set ("none" = thinking
  // fully off); anything outside the gateway vocabulary sends nothing.
  const EFFORT_VALUES = ["minimal", "low", "medium", "high", "xhigh", "none"];
  const reasoningEffort = EFFORT_VALUES.includes(body.reasoning_effort ?? "")
    ? body.reasoning_effort
    : undefined;
  const prototypeId = body.prototypeId;
  if (!prototypeId) return c.json({ error: "prototypeId required" }, 400);

  const proto = await getPrototypeForUser(prototypeId, userId);
  if (!proto) return c.json({ error: "prototype not found" }, 404);
  if (proto.status !== "ready") return c.json({ error: "prototype not ready" }, 409);

  const mastra = getMastra(proto, model);
  const stream = await handleChatStream({
    sendReasoning: true,
    mastra,
    agentId: CODER_AGENT_ID,
    version: "v6",
    params: {
      messages: (body.messages ?? []) as never,
      memory: { thread: prototypeId, resource: userId },
      maxSteps: 25,
      // Both keys: the model router registers the gateway as "neon", while
      // the underlying openai-compatible model reads the "openai" bag.
      ...(reasoningEffort
        ? {
            providerOptions: {
              neon: { reasoningEffort },
              openai: { reasoningEffort },
            },
          }
        : {}),
    },
  });

  return createUIMessageStreamResponse({ stream: smoothUIStream(stream) });
});

/**
 * Models emit text in coarse chunks (sometimes whole paragraphs). Re-slice
 * text and reasoning deltas into word-sized pieces with a small delay so the
 * chat reads as typing instead of slabs — the same idea as the AI SDK's
 * smoothStream, applied to the UI-message chunk stream Mastra hands us.
 */
const SMOOTH_TYPES = new Set(["text-delta", "reasoning-delta"]);
const SMOOTH_DELAY_MS = 10;

function smoothUIStream<T extends { type: string }>(stream: ReadableStream<T>): ReadableStream<T> {
  return stream.pipeThrough(
    new TransformStream<T, T>({
      async transform(chunk, controller) {
        const delta = (chunk as { delta?: unknown }).delta;
        if (!SMOOTH_TYPES.has(chunk.type) || typeof delta !== "string" || delta.length === 0) {
          controller.enqueue(chunk);
          return;
        }
        // Leading \s* matters: OpenAI-style models stream space-PREFIXED
        // token deltas (" What", " would") — a word-only split drops every
        // chunk-leading space and the reply renders asOneLongWord.
        const pieces = delta.match(/\s*\S+\s*/g) ?? [delta];
        for (const piece of pieces) {
          controller.enqueue({ ...chunk, delta: piece });
          await new Promise((resolve) => setTimeout(resolve, SMOOTH_DELAY_MS));
        }
      },
    }),
  );
}

export default app;
