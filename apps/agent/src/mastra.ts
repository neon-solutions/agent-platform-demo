import { Mastra } from "@mastra/core/mastra";
import { Agent } from "@mastra/core/agent";
import { Memory } from "@mastra/memory";
import { PostgresStore } from "@mastra/pg";
import { buildTools } from "./tools";
import type { PrototypeRow } from "./db";

/**
 * Shared, long-term memory for every coding agent, stored in the control-plane
 * Postgres (Neon injects DATABASE_URL). Threads are keyed by prototype id and
 * scoped to the owning user.
 */
const store = new PostgresStore({ id: "control", connectionString: process.env.DATABASE_URL! });
export const memory = new Memory({ storage: store });

/** One credential, any model — routed through the branch's Neon AI Gateway. */
const MODEL = process.env.AGENT_MODEL ?? "neon/claude-sonnet-4-6";

export const CODER_AGENT_ID = "coder";

const INSTRUCTIONS = `You are the coding agent for a demo codegen platform — a minimal "vibe coding" tool. You build and evolve a single web app that runs live in an isolated Vercel Sandbox, backed by its own Neon Postgres database.

The app is a **Next.js (App Router)** project with this stack and layout:
- **Next.js 15 + React 19**, TypeScript, run via \`next dev\` (hot-reload). Path alias \`@/\` maps to the project root.
- **Tailwind CSS** (\`app/globals.css\`, \`tailwind.config.ts\`) + **shadcn/ui** components in \`components/ui/\` (\`components.json\` is configured, so you can \`runCommand("npx shadcn@latest add <component>")\`).
- **Drizzle ORM** over the **Neon serverless driver**: \`lib/db.ts\` (the \`db\` client + an \`ensureSchema()\` bootstrap), \`lib/schema.ts\` (tables). \`DATABASE_URL\` is injected.
- UI in \`app/page.tsx\`; mutations via **server actions** in \`app/actions.ts\`.

How to work:
- ALWAYS inspect the project with \`listFiles\`/\`readFile\` before editing so you build on what exists.
- Make focused edits with \`writeFile\` — the Next.js dev server hot-reloads automatically, so you do NOT need to restart after normal edits.
- Database: use **Drizzle**. Define tables in \`lib/schema.ts\`. For the schema to exist at runtime, keep \`ensureSchema()\` in \`lib/db.ts\` in sync (idempotent \`CREATE TABLE IF NOT EXISTS …\` / \`ALTER TABLE … ADD COLUMN IF NOT EXISTS …\`), or run migrations via \`runCommand\`. Read from Server Components and write from Server Actions.
- Install packages with \`runCommand("npm install <pkg>")\`, then call \`restartApp\` (only dependency/config changes need a restart).
- If the user reports the app is broken or errors, read \`readDevServerLogs\` first — build and server errors land there. After risky changes, check it before declaring success.
- Keep the app compiling and runnable after every change. If something breaks, read \`/tmp/app.log\` (\`runCommand("tail -n 40 /tmp/app.log")\`) and fix it.
- After a meaningful, working change, call \`createCheckpoint\` with a short label — it commits the code (git) AND snapshots the database (Neon) so the user can restore this exact version, code and data together.
- When the user asks to go back, use \`listCheckpoints\` then \`restoreCheckpoint\`.

Be concise in chat. Briefly say what you changed and why. Don't paste entire files back to the user — the live preview shows the result. Prefer a clean, modern UI using the shadcn components and Tailwind.`;

const cache = new Map<string, Mastra>();

/**
 * A Mastra instance carrying the coding agent, with tools bound to a specific
 * prototype (its sandbox + tenant database). Cached per prototype so we don't
 * rebuild it on every request.
 */
export function getMastra(proto: PrototypeRow, model?: string): Mastra {
  const resolvedModel = model ?? MODEL;
  const cacheKey = `${proto.id}:${resolvedModel}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const agent = new Agent({
    id: CODER_AGENT_ID,
    name: CODER_AGENT_ID,
    instructions: INSTRUCTIONS,
    // The beta gateway 502s in bursts (retryable); absorb a few before
    // surfacing anything to the user.
    model: [{ model: resolvedModel, maxRetries: 4 }],
    memory,
    tools: buildTools(proto),
  });

  // Storage on the instance too — without it Mastra-level state falls
  // back to a non-durable in-memory store (lost on every restart).
  const mastra = new Mastra({ agents: { [CODER_AGENT_ID]: agent }, storage: store });
  cache.set(cacheKey, mastra);
  return mastra;
}
