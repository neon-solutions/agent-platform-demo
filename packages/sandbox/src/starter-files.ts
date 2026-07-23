/**
 * The starter app every prototype begins from: a modern Next.js (App Router)
 * app using Drizzle ORM over the Neon serverless driver, Tailwind, and
 * shadcn/ui components — connected to the tenant Neon Postgres via
 * DATABASE_URL. The coding agent edits these files to build whatever the user
 * asks for; Next's dev server hot-reloads changes.
 */
export interface SandboxFile {
  path: string;
  content: string;
}

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
      2,
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
      2,
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
      2,
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
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = { title: "My Vibe App" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {/* Report runtime errors to the platform workspace (parent frame) so
            the agent can see and fix them. No-op outside the preview iframe. */}
        <Script id="vibe-error-bridge" strategy="afterInteractive">{\`
          (function () {
            if (window.parent === window) return;
            var lastKey = "";
            var send = function (message, detail) {
              try {
                var key = String(message).slice(0, 200);
                if (key === lastKey) return; // dedupe error bursts
                lastKey = key;
                window.parent.postMessage(
                  { type: "vibe:runtime-error", message: String(message).slice(0, 2000), detail: String(detail || "").slice(0, 2000) },
                  "*"
                );
              } catch (_) {}
            };
            window.addEventListener("error", function (e) {
              send(e.message, e.error && e.error.stack);
            });
            window.addEventListener("unhandledrejection", function (e) {
              var r = e.reason || {};
              send(r.message || String(e.reason), r.stack);
            });
            // Server and build errors never hit window.onerror — Next.js dev
            // replays them through console.error for its overlay. Forward
            // those too, skipping React dev warnings.
            var origError = console.error;
            console.error = function () {
              try {
                var parts = [];
                for (var i = 0; i < arguments.length; i++) {
                  var a = arguments[i];
                  parts.push(a && a.stack ? a.stack : String(a));
                }
                var text = parts.join(" ").trim();
                if (text && text.indexOf("Warning:") !== 0 && /error|cannot|failed|invalid|exception/i.test(text)) {
                  send(text.split("\\n")[0].slice(0, 300), text);
                }
              } catch (_) {}
              return origError.apply(console, arguments);
            };
          })();
        \`}</Script>
      </body>
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
