import { Sandbox } from "@vercel/sandbox";
import { STARTER_FILES } from "./starter-files";

/**
 * Vercel Sandbox integration. Every vibe-coded app runs in its own persistent
 * sandbox (an isolated Linux microVM) serving a live Next.js dev server, wired
 * to the app's own Neon Postgres via DATABASE_URL. The sandbox name equals the
 * prototype id, so the platform (and the coding agent) can reopen it later.
 */

export const APP_PORT = 3000;
const SANDBOX_TIMEOUT_MS = 45 * 60_000;
const LISTEN_ATTEMPTS = 40;
const LISTEN_DELAY_MS = 1500;

interface VercelCreds {
  token: string;
  teamId: string;
  projectId: string;
}

/**
 * Explicit Vercel credentials when set (required for the agent, which runs
 * off-Vercel on a Neon Function). When absent — e.g. the control app running
 * on Vercel — the SDK falls back to the injected OIDC token automatically.
 * Reads process.env directly (not the validated env) so the agent can consume
 * this package without the full control-plane env schema.
 */
function creds(): VercelCreds | Record<string, never> {
  const token = process.env.VERCEL_TOKEN;
  const teamId = process.env.VERCEL_TEAM_ID;
  const projectId = process.env.VERCEL_PROJECT_ID;
  if (token && teamId && projectId) {
    return { token, teamId, projectId };
  }
  return {};
}

/** Run a shell command in the sandbox and throw if it fails. */
export async function runInSandbox(
  sandbox: Sandbox,
  script: string,
  env?: Record<string, string>,
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

/**
 * Is something accepting TCP connections on APP_PORT? (Next dev counts as up
 * even while it compiles the first request, so we check the socket, not HTTP.)
 */
async function isListening(sandbox: Sandbox): Promise<boolean> {
  const cmd = await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      `timeout 3 bash -c '</dev/tcp/127.0.0.1/${APP_PORT}' 2>/dev/null && echo open || echo closed`,
    ],
  });
  return (await cmd.stdout()).trim() === "open";
}

export async function waitForListening(
  sandbox: Sandbox,
  attempts = LISTEN_ATTEMPTS,
  delayMs = LISTEN_DELAY_MS,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await isListening(sandbox)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/**
 * The app's HTTP status ("000" if not reachable). A 5xx means it's up but
 * erroring (e.g. bad DB credentials) — which should trigger a heal.
 */
async function httpStatus(sandbox: Sandbox): Promise<string> {
  const cmd = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", `curl -s -o /dev/null -m 20 -w '%{http_code}' http://localhost:${APP_PORT}`],
  });
  return (await cmd.stdout()).trim();
}

/** Start (or restart) the Next.js dev server, detached, on APP_PORT. */
export async function startDevServer(sandbox: Sandbox, databaseUrl: string): Promise<void> {
  await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", "pkill -f 'next dev' || true; pkill -f next-server || true; sleep 1"],
  });
  await sandbox.runCommand({
    cmd: "bash",
    args: [
      "-lc",
      `nohup npx --no-install next dev -H 0.0.0.0 -p ${APP_PORT} > /tmp/app.log 2>&1 &`,
    ],
    env: {
      DATABASE_URL: databaseUrl,
      PORT: String(APP_PORT),
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_ENV: "development",
    },
    detached: true,
  });
}

export interface CreatedSandbox {
  name: string;
  url: string;
}

/**
 * Provision a fresh sandbox for a prototype: seed the Next.js starter, git init
 * + first commit, install deps, boot the dev server, and wait until it serves.
 */
export async function createAppSandbox(params: {
  name: string;
  databaseUrl: string;
  /** Called at each boot phase with a human-readable detail line. */
  onProgress?: (detail: string) => void | Promise<void>;
}): Promise<CreatedSandbox> {
  const progress = async (detail: string) => {
    await params.onProgress?.(detail);
  };

  await progress("Booting Vercel Sandbox…");
  const sandbox = await Sandbox.create({
    runtime: "node24",
    ...creds(),
    ports: [APP_PORT],
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    env: {
      DATABASE_URL: params.databaseUrl,
      PORT: String(APP_PORT),
      NEXT_TELEMETRY_DISABLED: "1",
    },
    name: params.name,
  } as Parameters<typeof Sandbox.create>[0]);

  await progress("Seeding the starter app…");
  await sandbox.writeFiles(STARTER_FILES.map((f) => ({ path: f.path, content: f.content })));
  await progress("Installing dependencies…");
  await runInSandbox(
    sandbox,
    "git init -q && git config user.email agent@vibe.dev && git config user.name 'Vibe Agent' && git add -A && git commit -q -m 'chore: scaffold Next.js + Drizzle + shadcn starter' && npm install --no-audit --no-fund --loglevel=error",
  );
  await progress("Starting the dev server…");
  await startDevServer(sandbox, params.databaseUrl);
  await waitForListening(sandbox);

  return { name: params.name, url: sandbox.domain(APP_PORT) };
}

/** Reopen an existing sandbox by prototype id (its name). */
export function getAppSandbox(name: string): Promise<Sandbox> {
  return Sandbox.get({ name, resume: true, ...creds() });
}

/**
 * Bring a prototype's app back to a live, serving state. Sandboxes suspend or
 * stop on their idle timeout, so opening a preview after a while can 502. This
 * resumes the sandbox via the SDK, (re)starts the Next.js dev server if it
 * isn't healthy, and pushes out the timeout so an active session isn't
 * evicted.
 */
export async function ensureAppRunning(
  name: string,
  databaseUrl: string,
): Promise<{ url: string }> {
  const sandbox = await getAppSandbox(name);

  try {
    await sandbox.extendTimeout(SANDBOX_TIMEOUT_MS);
  } catch {
    // Best-effort: already at the plan's max, or not resumable to extend.
  }

  // Heal on open: (re)start the dev server with the CURRENT connection string
  // whenever the app isn't serving a healthy response. A 5xx means it's up but
  // erroring (e.g. the baked-in DB credentials drifted); restarting with the
  // freshly-resolved databaseUrl self-heals it.
  const status = await httpStatus(sandbox);
  const healthy = /^[23]\d\d$/.test(status);
  if (!healthy) {
    await startDevServer(sandbox, databaseUrl);
    await waitForListening(sandbox);
  }

  return { url: sandbox.domain(APP_PORT) };
}

export { Sandbox };

/**
 * Stop a prototype's sandbox, best-effort: called during app teardown where
 * a missing or already-stopped sandbox is success, not failure.
 */
export async function stopAppSandbox(name: string): Promise<void> {
  try {
    const sandbox = await Sandbox.get({ name, ...creds() });
    await sandbox.stop();
  } catch {
    // Already gone or never created — teardown proceeds.
  }
}
