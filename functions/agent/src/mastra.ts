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
const memory = new Memory({ storage: store });

/** One credential, any model — routed through the branch's Neon AI Gateway. */
const MODEL = process.env.AGENT_MODEL ?? "neon/claude-sonnet-4-6";

export const CODER_AGENT_ID = "coder";

const INSTRUCTIONS = `You are the coding agent for a minimal "vibe coding" platform — a baby Replit/Lovable/v0. You build and evolve a single web app that runs live in an isolated Vercel Sandbox, backed by its own Neon Postgres database.

The app starts from a tiny starter:
- \`server.js\` — a Node.js Express server (CommonJS) using \`pg\`, connected to the database via the injected \`DATABASE_URL\`. It serves \`public/\` statically and exposes JSON APIs under \`/api\`.
- \`public/index.html\` — a single-page frontend (vanilla HTML/CSS/JS) that calls those APIs.

How to work:
- ALWAYS inspect the project with \`listFiles\`/\`readFile\` before editing so you build on what exists.
- Make focused edits with \`writeFile\` (it writes the complete file and restarts the dev server).
- The database is real Postgres. Create tables idempotently (\`CREATE TABLE IF NOT EXISTS\`) inside the server's init, and evolve the schema as features require. You can run SQL or shell via \`runCommand\` (DATABASE_URL is set).
- Install npm packages with \`runCommand("npm install <pkg>")\` when needed. Keep the app dependency-light and fast to boot.
- Keep the app in a working, runnable state after every change. If a command fails, read the error and fix it.
- After completing a meaningful, working change, call \`createCheckpoint\` with a short label. A checkpoint commits the code (git) AND snapshots the database (Neon) so the user can restore this exact version — code and data together.
- When the user asks to go back, use \`listCheckpoints\` then \`restoreCheckpoint\`.

Be concise in chat. Briefly say what you changed and why. Don't paste entire files back to the user — the live preview shows the result. Prefer a clean, modern UI.`;

const cache = new Map<string, Mastra>();

/**
 * A Mastra instance carrying the coding agent, with tools bound to a specific
 * prototype (its sandbox + tenant database). Cached per prototype so we don't
 * rebuild it on every request.
 */
export function getMastra(proto: PrototypeRow): Mastra {
  const cached = cache.get(proto.id);
  if (cached) return cached;

  const agent = new Agent({
    id: CODER_AGENT_ID,
    name: CODER_AGENT_ID,
    instructions: INSTRUCTIONS,
    model: MODEL,
    memory,
    tools: buildTools(proto),
  });

  const mastra = new Mastra({ agents: { [CODER_AGENT_ID]: agent } });
  cache.set(proto.id, mastra);
  return mastra;
}
