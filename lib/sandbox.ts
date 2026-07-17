import { Sandbox } from "@vercel/sandbox";

/**
 * Vercel Sandbox integration. Every vibe-coded app runs in its own persistent
 * sandbox (an isolated Linux microVM) serving a live Next.js dev server, wired
 * to the app's own Neon Postgres via DATABASE_URL. The sandbox name equals the
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
 * The starter app every prototype begins from: a modern **Next.js (App Router)**
 * app using **Drizzle ORM** over the **Neon serverless driver**, **Tailwind**,
 * and **shadcn/ui** components — connected to the tenant Neon Postgres via
 * DATABASE_URL. The coding agent edits these files to build whatever the user
 * asks for; Next's dev server hot-reloads changes.
 */
export const STARTER_FILES: SandboxFile[] = [
  {
    path: "package.json",
    content: JSON.stringify(
      {
        name: "vibe-app",
        private: true,
        scripts: {
          dev: "next dev",
          build: "next build",
          start: "next start",
          "db:push": "drizzle-kit push",
        },
        dependencies: {
          next: "^15.1.6",
          react: "^19.0.0",
          "react-dom": "^19.0.0",
          "drizzle-orm": "^0.44.2",
          "@neondatabase/serverless": "^1.0.1",
          clsx: "^2.1.1",
          "tailwind-merge": "^2.6.0",
          "class-variance-authority": "^0.7.1",
          "lucide-react": "^0.469.0",
        },
        devDependencies: {
          typescript: "^5.7.3",
          "@types/node": "^22.10.7",
          "@types/react": "^19.0.7",
          "@types/react-dom": "^19.0.3",
          tailwindcss: "^3.4.17",
          postcss: "^8.5.1",
          autoprefixer: "^10.4.20",
          "drizzle-kit": "^0.31.1",
        },
      },
      null,
      2
    ),
  },
  {
    path: ".gitignore",
    content: "node_modules\n.next\nnext-env.d.ts\n*.tsbuildinfo\n",
  },
  {
    path: "next.config.mjs",
    content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
};
export default nextConfig;
`,
  },
  {
    path: "tsconfig.json",
    content: JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["dom", "dom.iterable", "ES2023"],
          allowJs: true,
          skipLibCheck: true,
          strict: true,
          noEmit: true,
          esModuleInterop: true,
          module: "esnext",
          moduleResolution: "bundler",
          resolveJsonModule: true,
          isolatedModules: true,
          jsx: "preserve",
          incremental: true,
          plugins: [{ name: "next" }],
          paths: { "@/*": ["./*"] },
        },
        include: ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
        exclude: ["node_modules"],
      },
      null,
      2
    ),
  },
  {
    path: "postcss.config.mjs",
    content: `const config = { plugins: { tailwindcss: {}, autoprefixer: {} } };
export default config;
`,
  },
  {
    path: "tailwind.config.ts",
    content: `import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: { DEFAULT: "hsl(var(--primary))", foreground: "hsl(var(--primary-foreground))" },
        secondary: { DEFAULT: "hsl(var(--secondary))", foreground: "hsl(var(--secondary-foreground))" },
        muted: { DEFAULT: "hsl(var(--muted))", foreground: "hsl(var(--muted-foreground))" },
        card: { DEFAULT: "hsl(var(--card))", foreground: "hsl(var(--card-foreground))" },
      },
      borderRadius: { lg: "var(--radius)", md: "calc(var(--radius) - 2px)", sm: "calc(var(--radius) - 4px)" },
    },
  },
  plugins: [],
};
export default config;
`,
  },
  {
    path: "components.json",
    content: JSON.stringify(
      {
        $schema: "https://ui.shadcn.com/schema.json",
        style: "new-york",
        rsc: true,
        tsx: true,
        tailwind: {
          config: "tailwind.config.ts",
          css: "app/globals.css",
          baseColor: "neutral",
          cssVariables: true,
        },
        aliases: { components: "@/components", utils: "@/lib/utils", ui: "@/components/ui" },
      },
      null,
      2
    ),
  },
  {
    path: "drizzle.config.ts",
    content: `import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./lib/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
`,
  },
  {
    path: "lib/utils.ts",
    content: `import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
`,
  },
  {
    path: "lib/schema.ts",
    content: `import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const notes = pgTable("notes", {
  id: serial("id").primaryKey(),
  body: text("body").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
`,
  },
  {
    path: "lib/db.ts",
    content: `import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import * as schema from "./schema";

const client = neon(process.env.DATABASE_URL!);
export const db = drizzle(client, { schema });

// Self-bootstrapping schema so the app works on first boot. When you evolve the
// schema, update lib/schema.ts AND this DDL (or run SQL / drizzle-kit push).
let ensured = false;
export async function ensureSchema() {
  if (ensured) return;
  await db.execute(
    sql.raw(
      "CREATE TABLE IF NOT EXISTS notes (id serial PRIMARY KEY, body text NOT NULL, created_at timestamptz NOT NULL DEFAULT now())"
    )
  );
  ensured = true;
}
`,
  },
  {
    path: "app/globals.css",
    content: `@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;
  --primary: 142 71% 45%;
  --primary-foreground: 0 0% 100%;
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 142 71% 45%;
  --radius: 0.6rem;
}

* { border-color: hsl(var(--border)); }
body { background: hsl(var(--background)); color: hsl(var(--foreground)); }
`,
  },
  {
    path: "app/layout.tsx",
    content: `import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "My Vibe App" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
`,
  },
  {
    path: "app/actions.ts",
    content: `"use server";
import { revalidatePath } from "next/cache";
import { db, ensureSchema } from "@/lib/db";
import { notes } from "@/lib/schema";

export async function addNote(formData: FormData) {
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return;
  await ensureSchema();
  await db.insert(notes).values({ body });
  revalidatePath("/");
}
`,
  },
  {
    path: "app/page.tsx",
    content: `import { desc } from "drizzle-orm";
import { db, ensureSchema } from "@/lib/db";
import { notes } from "@/lib/schema";
import { addNote } from "./actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function Home() {
  await ensureSchema();
  const rows = await db.select().from(notes).orderBy(desc(notes.id));
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col gap-6 p-8">
      <div>
        <h1 className="text-2xl font-semibold">My Vibe App</h1>
        <p className="text-sm text-muted-foreground">
          Next.js + Drizzle + shadcn/ui on Neon Postgres. Ask the agent to change anything.
        </p>
      </div>
      <form action={addNote} className="flex gap-2">
        <Input name="body" placeholder="Write a note…" autoComplete="off" />
        <Button type="submit">Add</Button>
      </form>
      <div className="flex flex-col gap-2">
        {rows.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">No notes yet — add one above.</p>
        ) : (
          rows.map((n) => (
            <Card key={n.id} className="px-4 py-3 text-sm">
              {n.body}
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
`,
  },
  {
    path: "components/ui/button.tsx",
    content: `import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        outline: "border border-input bg-transparent hover:bg-secondary",
        ghost: "hover:bg-secondary",
      },
      size: { default: "h-10 px-4 py-2", sm: "h-9 px-3", icon: "h-10 w-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button ref={ref} className={cn(buttonVariants({ variant, size, className }))} {...props} />
  )
);
Button.displayName = "Button";
`,
  },
  {
    path: "components/ui/input.tsx",
    content: `import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        className
      )}
      {...props}
    />
  )
);
Input.displayName = "Input";
`,
  },
  {
    path: "components/ui/card.tsx",
    content: `import * as React from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-xl border border-border bg-card text-card-foreground shadow-sm", className)}
      {...props}
    />
  );
}
`,
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

/** Is something accepting TCP connections on APP_PORT? (Next dev counts as up
 *  even while it compiles the first request, so we check the socket, not HTTP.) */
async function isListening(sandbox: Sandbox): Promise<boolean> {
  const cmd = await sandbox.runCommand({
    cmd: "bash",
    args: ["-lc", `timeout 3 bash -c '</dev/tcp/127.0.0.1/${APP_PORT}' 2>/dev/null && echo open || echo closed`],
  });
  return (await cmd.stdout()).trim() === "open";
}

async function waitForListening(sandbox: Sandbox, attempts = 40, delayMs = 1500): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await isListening(sandbox)) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

/** The app's HTTP status ("000" if not reachable). A 5xx means it's up but
 *  erroring (e.g. bad DB credentials) — which should trigger a heal. */
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
    args: ["-lc", `nohup npx --no-install next dev -H 0.0.0.0 -p ${APP_PORT} > /tmp/app.log 2>&1 &`],
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
}): Promise<CreatedSandbox> {
  const sandbox = await Sandbox.create({
    runtime: "node24",
    ...creds(),
    ports: [APP_PORT],
    timeout: SANDBOX_TIMEOUT_MS,
    persistent: true,
    env: { DATABASE_URL: params.databaseUrl, PORT: String(APP_PORT), NEXT_TELEMETRY_DISABLED: "1" },
    name: params.name,
  } as Parameters<typeof Sandbox.create>[0]);

  await sandbox.writeFiles(STARTER_FILES.map((f) => ({ path: f.path, content: f.content })));
  await runInSandbox(
    sandbox,
    "git init -q && git config user.email agent@vibe.dev && git config user.name 'Vibe Agent' && git add -A && git commit -q -m 'chore: scaffold Next.js + Drizzle + shadcn starter' && npm install --no-audit --no-fund --loglevel=error"
  );
  await startDevServer(sandbox, params.databaseUrl);
  await waitForListening(sandbox);

  return { name: params.name, url: sandbox.domain(APP_PORT) };
}

/** Reopen an existing sandbox by prototype id (its name). */
export async function getAppSandbox(name: string): Promise<Sandbox> {
  return Sandbox.get({ name, resume: true, ...creds() });
}

/**
 * Bring a prototype's app back to a live, serving state. Sandboxes suspend/stop
 * on their idle timeout, so opening a preview after a while can 502. This
 * resumes the sandbox via the SDK, (re)starts the Next.js dev server if it isn't
 * listening, and pushes out the timeout so an active session isn't evicted.
 */
export async function ensureAppRunning(
  name: string,
  databaseUrl: string
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
  // freshly-resolved `databaseUrl` self-heals it.
  const status = await httpStatus(sandbox);
  const healthy = /^[23]\d\d$/.test(status);
  if (!healthy) {
    await startDevServer(sandbox, databaseUrl);
    await waitForListening(sandbox);
  }

  return { url: sandbox.domain(APP_PORT) };
}

export { Sandbox };
