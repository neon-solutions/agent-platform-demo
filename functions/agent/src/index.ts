import { Hono } from "hono";
import { cors } from "hono/cors";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { createUIMessageStreamResponse } from "ai";
import { handleChatStream } from "@mastra/ai-sdk";
import { getMastra, CODER_AGENT_ID } from "./mastra";
import { getPrototypeForUser } from "./db";

/**
 * The coding agent, hosted as a long-running Neon Function next to the
 * control-plane Postgres. The browser calls it directly with a short-lived
 * Better Auth JWT (verified here against the app's JWKS), so the app server is
 * never in the path of the long agent stream.
 */
const AUTH_BASE_URL = process.env.AUTH_BASE_URL ?? "";
const jwks = AUTH_BASE_URL
  ? createRemoteJWKSet(new URL(`${AUTH_BASE_URL}/api/auth/jwks`))
  : null;

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
  })
);

app.get("/health", (c) => c.json({ ok: true }));

app.post("/chat", async (c) => {
  const userId = await authUserId(c.req.raw);
  if (!userId) return c.json({ error: "unauthorized" }, 401);

  const body = await c.req.json<{ messages?: unknown[]; prototypeId?: string }>();
  const prototypeId = body.prototypeId;
  if (!prototypeId) return c.json({ error: "prototypeId required" }, 400);

  const proto = await getPrototypeForUser(prototypeId, userId);
  if (!proto) return c.json({ error: "prototype not found" }, 404);
  if (proto.status !== "ready") return c.json({ error: "prototype not ready" }, 409);

  const mastra = getMastra(proto);
  const stream = await handleChatStream({
    mastra,
    agentId: CODER_AGENT_ID,
    version: "v6",
    params: {
      messages: (body.messages ?? []) as never,
      memory: { thread: prototypeId, resource: userId },
      maxSteps: 25,
    },
  });

  return createUIMessageStreamResponse({ stream });
});

export default app;
