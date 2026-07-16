import { Sandbox } from "@vercel/sandbox";

/**
 * Vercel Sandbox integration. Every vibe-coded app runs in its own persistent
 * sandbox (an isolated Linux microVM) that serves a live dev server, wired to
 * the app's own Neon Postgres via DATABASE_URL. The sandbox name equals the
 * prototype id, so the platform (and the coding agent) can reopen it later.
 */

export const APP_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 45 * 60_000;

interface VercelCreds {
  token: string;
  teamId: string;
  projectId: string;
}

/**
 * Explicit Vercel credentials when set (required for the agent, which runs
 * off-Vercel on a Neon Function). When absent — e.g. the control app running
 * on Vercel — the SDK falls back to the injected OIDC token automatically.
 */
function creds(): VercelCreds | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) return { token, teamId, projectId };
  return {};
}

export interface SandboxFile {
  path: string;
  content: string;
}

/**
 * The starter app every prototype begins from: a tiny Express server backed by
 * the tenant Neon Postgres (via `pg`), serving a styled single page. The coding
 * agent edits these files to build whatever the user asks for.
 */
export const STARTER_FILES: SandboxFile[] = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "vibe-app",
        private: true,
        type: "commonjs",
        scripts: { start: "node server.js" },
        dependencies: { express: "^4.21.2", pg: "^8.13.1" },
      },
      null,
      2
    ),
  },
  {
    path: "server.js",
    content: `const express = require("express");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3 });
const app = express();
app.use(express.json());

// Auto-create a demo table so the app works on first boot.
async function init() {
  await pool.query(\`CREATE TABLE IF NOT EXISTS notes (
    id serial PRIMARY KEY,
    body text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )\`);
}

app.get("/api/notes", async (_req, res) => {
  const { rows } = await pool.query("SELECT * FROM notes ORDER BY id DESC");
  res.json(rows);
});

app.post("/api/notes", async (req, res) => {
  const body = (req.body && req.body.body ? String(req.body.body) : "").trim();
  if (!body) return res.status(400).json({ error: "body required" });
  const { rows } = await pool.query(
    "INSERT INTO notes (body) VALUES ($1) RETURNING *",
    [body]
  );
  res.status(201).json(rows[0]);
});

app.use(express.static("public"));

const port = process.env.PORT || 3000;
init()
  .then(() => app.listen(port, () => console.log("app listening on " + port)))
  .catch((err) => {
    console.error("init failed", err);
    process.exit(1);
  });
`,
  },
  {
    path: "public/index.html",
    content: `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>My Vibe App</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; margin: 0;
    background: #0a0a0a; color: #ededed; display: grid; place-items: center; min-height: 100vh; }
  main { width: min(560px, 92vw); padding: 32px; }
  h1 { font-size: 28px; margin: 0 0 4px; }
  p.sub { color: #9ca3af; margin: 0 0 24px; }
  form { display: flex; gap: 8px; margin-bottom: 20px; }
  input { flex: 1; padding: 12px 14px; border-radius: 10px; border: 1px solid #262626;
    background: #141414; color: inherit; font-size: 15px; }
  button { padding: 12px 18px; border-radius: 10px; border: 0; background: #00e599;
    color: #00110b; font-weight: 600; cursor: pointer; font-size: 15px; }
  ul { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; }
  li { padding: 14px 16px; border-radius: 10px; background: #141414; border: 1px solid #262626; }
  .empty { color: #6b7280; text-align: center; padding: 24px 0; }
</style>
</head>
<body>
<main>
  <h1>My Vibe App</h1>
  <p class="sub">Built on Neon Postgres. Ask the agent to change anything.</p>
  <form id="f">
    <input id="i" placeholder="Write a note…" autocomplete="off" />
    <button type="submit">Add</button>
  </form>
  <ul id="list"></ul>
</main>
<script>
async function load() {
  const res = await fetch("/api/notes");
  const notes = await res.json();
  const list = document.getElementById("list");
  list.innerHTML = notes.length
    ? notes.map((n) => "<li>" + n.body.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])) + "</li>").join("")
    : '<div class="empty">No notes yet — add one above.</div>';
}
document.getElementById("f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = document.getElementById("i");
  const body = input.value.trim();
  if (!body) return;
  await fetch("/api/notes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ body }) });
  input.value = "";
  load();
});
load();
</script>
</body>
</html>
`,
  },
  {
    path: ".gitignore",
    content: "node_modules\n",
  },
];

/** Run a shell command in the sandbox and throw if it fails. */
export async function runInSandbox(
  sandbox: Sandbox,
  script: string,
  env?: Record<string, string>
): Promise<string> {
  const cmd = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", script],
    env,
  });
  const [out, err] = await Promise.all([cmd.stdout(), cmd.stderr()]);
  if (cmd.exitCode !== 0) {
    throw new Error(`command failed (${cmd.exitCode}): ${script}\n${err || out}`);
  }
  return out;
}

/** Start (or restart) the app's dev server, detached, on APP_PORT. */
export async function startDevServer(sandbox: Sandbox, databaseUrl: string): Promise<void> {
  // Kill any previous server, then relaunch detached.
  await sandbox.runCommand({ cmd: "bash", args: ["-lc", "pkill -f 'node server.js' || true"] });
  await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", "nohup node server.js > /tmp/app.log 2>&1 &"],
    env: { DATABASE_URL: databaseUrl, PORT: String(APP_PORT) },
    detached: true,
  });
}

export interface CreatedSandbox {
  name: string;
  url: string;
}

/**
 * Provision a fresh sandbox for a prototype: seed the starter template, git
 * init + first commit, install deps, and boot the dev server.
 */
export async function createAppSandbox(params: {
  name: string;
  databaseUrl: string;
}): Promise<CreatedSandbox> {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    ...creds(),
    ports: [APP_PORT],
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    env: { DATABASE_URL: params.databaseUrl, PORT: String(APP_PORT) },
    // Name it after the prototype so we can reopen it via Sandbox.get.
    name: params.name,
  } as Parameters<typeof Sandbox.create>[0]);

  await sandbox.writeFiles(STARTER_FILES.map((f) => ({ path: f.path, content: f.content })));
  await runInSandbox(
    sandbox,
    "git init -q && git config user.email agent@vibe.dev && git config user.name 'Vibe Agent' && git add -A && git commit -q -m 'chore: scaffold starter app' && npm install --no-audit --no-fund --loglevel=error"
  );
  await startDevServer(sandbox, params.databaseUrl);

  return { name: params.name, url: sandbox.domain(APP_PORT) };
}

/** Reopen an existing sandbox by prototype id (its name). */
export async function getAppSandbox(name: string): Promise<Sandbox> {
  return Sandbox.get({ name, resume: true, ...creds() });
}

/** Is the app's dev server currently listening on APP_PORT inside the sandbox? */
async function isListening(sandbox: Sandbox): Promise<boolean> {
  const cmd = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      // curl prints "000" as the http_code when it can't connect (server down).
      `curl -s -o /dev/null -m 3 -w '%{http_code}' http://localhost:${APP_PORT}`,
    ],
  });
  const code = (await cmd.stdout()).trim();
  // A real HTTP status (2xx/3xx/4xx/5xx) means the server is accepting connections.
  return /^[2345]\d\d$/.test(code);
}

/**
 * Bring a prototype's app back to a live, serving state. Sandboxes suspend/stop
 * on their idle timeout, so opening a preview after a while can 502 with
 * SANDBOX_NOT_LISTENING. This resumes the sandbox via the SDK (which waits for
 * readiness), (re)starts the dev server if it isn't listening, and pushes out
 * the timeout so an active session doesn't get evicted mid-use.
 */
export async function ensureAppRunning(
  name: string,
  databaseUrl: string
): Promise<{ url: string }> {
  const sandbox = await getAppSandbox(name);

  // Keep an actively-used prototype alive longer.
  try {
    await sandbox.extendTimeout(SANDBOX_TIMEOUT_MS);
  } catch {
    // Best-effort: already at the plan's max, or not resumable to extend.
  }

  if (!(await isListening(sandbox))) {
    await startDevServer(sandbox, databaseUrl);
    // Poll until the server accepts connections (npm deps are already installed).
    for (let i = 0; i < 15; i++) {
      if (await isListening(sandbox)) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }

  return { url: sandbox.domain(APP_PORT) };
}

export { Sandbox };
