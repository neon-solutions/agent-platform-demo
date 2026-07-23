import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { getAppSandbox, runInSandbox, startDevServer } from "@vibe/sandbox";
import { snapshotTenantBranch, restoreTenantSnapshot, type Plan } from "@vibe/neon";
import {
  insertCheckpoint,
  listCheckpointsForPrototype,
  getCheckpoint,
  setActiveCheckpoint,
  type PrototypeRow,
} from "./db";

const MAX_OUTPUT = 8000;
const truncate = (s: string) =>
  s.length > MAX_OUTPUT ? s.slice(0, MAX_OUTPUT) + "\n…(truncated)" : s;

/**
 * Build the coding agent's tools, bound to a single prototype: its sandbox
 * (code) and tenant Neon branch (data). All file/command work happens inside
 * the app's isolated Vercel Sandbox.
 */
export function buildTools(proto: PrototypeRow) {
  const sandboxName = proto.sandboxId ?? proto.id;
  const databaseUrl = proto.databaseUrl ?? "";
  const plan = (proto.plan as Plan) ?? "free";

  async function sandbox() {
    return getAppSandbox(sandboxName);
  }

  return {
    listFiles: createTool({
      id: "listFiles",
      description:
        "List the app's source files (tracked by git, excluding node_modules). Use this to understand the current project before editing.",
      inputSchema: z.object({}),
      execute: async () => {
        const sb = await sandbox();
        const out = await runInSandbox(sb, "git ls-files 2>/dev/null || ls -A");
        return { files: out.trim().split("\n").filter(Boolean) };
      },
    }),

    readFile: createTool({
      id: "readFile",
      description:
        "Read the full contents of a file in the app (path relative to the project root).",
      inputSchema: z.object({ path: z.string() }),
      execute: async ({ path }) => {
        const sb = await sandbox();
        const out = await runInSandbox(sb, `cat ${JSON.stringify(path)}`);
        return { path, content: truncate(out) };
      },
    }),

    writeFile: createTool({
      id: "writeFile",
      description:
        "Create or overwrite a file in the Next.js app with the given content. The dev server hot-reloads automatically — no restart needed. Use for all code edits (app/, lib/, components/).",
      inputSchema: z.object({
        path: z
          .string()
          .describe("Path relative to project root, e.g. app/page.tsx or lib/schema.ts"),
        content: z.string().describe("The complete new file contents."),
      }),
      execute: async ({ path, content }) => {
        const sb = await sandbox();
        await sb.writeFiles([{ path, content }]);
        return { ok: true, path };
      },
    }),

    runCommand: createTool({
      id: "runCommand",
      description:
        "Run a shell command in the app's sandbox (e.g. `npm install <pkg>`, `ls`, `node -e ...`). DATABASE_URL is set. Returns combined stdout/stderr.",
      inputSchema: z.object({ command: z.string() }),
      execute: async ({ command }) => {
        const sb = await sandbox();
        const out = await runInSandbox(sb, command, {
          DATABASE_URL: databaseUrl,
        }).catch((e) => (e instanceof Error ? e.message : String(e)));
        return { output: truncate(out) };
      },
    }),

    readDevServerLogs: createTool({
      id: "readDevServerLogs",
      description:
        "Read the tail of the Next.js dev server log (build errors, server crashes, request errors). Check this after writing files if the user reports the app is broken, or before answering that a change worked.",
      // No .int()/.min()/.max(): they emit JSON-schema integer bounds that
      // some gateway routes reject outright (llama-4-maverick 400s with
      // "integer types do not support minimum"). Clamp at runtime instead.
      inputSchema: z.object({
        lines: z.number().default(120).describe("How many trailing log lines to read (10-500)."),
      }),
      execute: async ({ lines }) => {
        const count = Math.min(500, Math.max(10, Math.round(lines)));
        const sb = await sandbox();
        const out = await runInSandbox(
          sb,
          `tail -n ${count} /tmp/app.log 2>/dev/null || echo '(no log yet)'`,
        ).catch((e) => (e instanceof Error ? e.message : String(e)));
        return { log: truncate(out) };
      },
    }),

    restartApp: createTool({
      id: "restartApp",
      description:
        "Restart the Next.js dev server. Only needed after installing dependencies or changing config/env — normal file edits hot-reload on their own.",
      inputSchema: z.object({}),
      execute: async () => {
        const sb = await sandbox();
        await startDevServer(sb, databaseUrl);
        return { ok: true };
      },
    }),

    createCheckpoint: createTool({
      id: "createCheckpoint",
      description:
        "Save a checkpoint of the app: commit the code (git) AND snapshot the database (Neon). Call this after completing a meaningful change so the user can restore this exact version later.",
      inputSchema: z.object({
        label: z.string().describe("Short human-readable label, e.g. 'Add dark mode'."),
      }),
      execute: async ({ label }) => {
        const sb = await sandbox();
        const safe = label.replace(/'/g, "'\\''");
        const sha = (
          await runInSandbox(
            sb,
            `git add -A && (git commit -q -m '${safe}' || true) && git rev-parse HEAD`,
          )
        ).trim();
        let snapshotId: string | null = null;
        if (proto.neonProjectId && proto.neonBranchId) {
          snapshotId = await snapshotTenantBranch(
            plan,
            proto.neonProjectId,
            proto.neonBranchId,
            label,
          ).catch(() => null);
        }
        const row = await insertCheckpoint({
          prototypeId: proto.id,
          label,
          gitSha: sha || null,
          snapshotId,
          // Compound dimensions: bind the code + data + runnable surface.
          neonProjectId: proto.neonProjectId ?? null,
          neonBranchId: proto.neonBranchId ?? null,
          sandboxUrl: proto.sandboxUrl ?? null,
        });
        // The new checkpoint is what the app now reflects — move the
        // rail's "current" marker off any previously restored one.
        await setActiveCheckpoint(proto.id, row.id);
        return { id: row.id, label: row.label, gitSha: sha, snapshotId };
      },
    }),

    listCheckpoints: createTool({
      id: "listCheckpoints",
      description: "List saved checkpoints (code + data versions) for this app, newest first.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await listCheckpointsForPrototype(proto.id);
        return {
          checkpoints: rows.map((r) => ({
            id: r.id,
            label: r.label,
            createdAt: r.createdAt,
            hasSnapshot: Boolean(r.snapshotId),
          })),
        };
      },
    }),

    restoreCheckpoint: createTool({
      id: "restoreCheckpoint",
      description:
        "Restore the app to a previous checkpoint: reset the code (git) AND the database (Neon snapshot) so the code works against its original schema and data.",
      inputSchema: z.object({ checkpointId: z.string() }),
      execute: async ({ checkpointId }) => {
        const cp = await getCheckpoint(proto.id, checkpointId);
        if (!cp) return { ok: false, error: "checkpoint not found" };
        const sb = await sandbox();
        if (cp.gitSha) {
          await runInSandbox(
            sb,
            `git checkout -f ${cp.gitSha} -- . && git checkout ${cp.gitSha} 2>/dev/null || git reset --hard ${cp.gitSha}`,
          );
          await startDevServer(sb, databaseUrl);
        }
        if (cp.snapshotId && proto.neonProjectId && proto.neonBranchId) {
          await restoreTenantSnapshot(plan, proto.neonProjectId, cp.snapshotId, proto.neonBranchId);
        }
        return { ok: true, restoredTo: cp.label };
      },
    }),
  };
}
