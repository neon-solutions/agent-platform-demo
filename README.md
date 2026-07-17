# Vibe — a demo codegen platform on Neon

A minimal **codegen platform**: users describe an app in chat, and a coding
agent vibe-codes it into a live, isolated environment — with every prototype
getting its **own Postgres database** and **checkpoints that version code _and_
data together**.

It's built entirely on the Neon backend platform + Vercel:

| Layer | Tech |
|---|---|
| **Control app** (auth, dashboard, workspace UI) | Next.js 15 on **Vercel** |
| **Auth + source of truth** | **Better Auth** (email/password + JWT) + **Drizzle** on **Neon Postgres** |
| **Coding agent** | **Mastra** agent (memory + tools) hosted on a **Neon Function**, streamed to the UI via `@mastra/ai-sdk` + the AI SDK |
| **LLM access** | **Neon AI Gateway** (one credential, any model — `neon/claude-sonnet-4-6`) |
| **Per-app database** | An isolated **Neon Postgres** project per prototype, provisioned via **`@neon/sdk`** |
| **Build & serve the app** | **Vercel Sandboxes** (a live dev server per prototype) |
| **Checkpoints** | **git** commit (code) + **Neon snapshot** (database), restorable together |

## How it works

```
 Browser ──JWT──▶ Neon Function (Mastra coding agent)      ← no host timeout on the long stream
    │                  │   tools: writeFile / runCommand / checkpoint / restore
    │                  ├──▶ Vercel Sandbox   (the app's code + live dev server)
    │                  └──▶ Neon AI Gateway  (LLM)  +  Neon snapshots (tenant DB)
    ▼
 Next.js control app (Vercel) ── Better Auth + Drizzle ──▶ Neon Postgres (control plane)
    │  provisions per-app:  @neon/sdk ──▶ tenant Neon project     Vercel SDK ──▶ sandbox
    ▼
 Live preview (iframe of the sandbox)  +  checkpoint timeline
```

1. **Sign up** → **Create an app** (choose a free- or paid-plan Neon org for its DB).
2. The control app provisions an **isolated Neon Postgres project** for the app and boots a
   **Vercel Sandbox** running a starter **Next.js + Drizzle + shadcn/ui** app
   (on the Neon serverless driver) wired to that database.
3. **Chat** with the coding agent. The browser calls the **Neon Function directly** with a
   short-lived Better Auth **JWT** (verified against the app's JWKS), so the app server is
   never in the path of the long agent stream. The agent edits files, runs commands, and
   restarts the dev server — the preview updates live.
4. **Checkpoint** after a change: the agent commits the code (git, in the sandbox) **and**
   snapshots the database (Neon). Restoring a checkpoint resets **both**, so the code always
   matches its schema + data — the pattern from
   [Build Checkpoints For Your Agent Using Neon Snapshots](https://neon.com/blog/checkpoints-for-agents-with-neon-snapshots).

## Neon-for-platforms patterns shown

This demo deliberately exercises the control-plane patterns from the
[`neon-postgres-agent-platforms`](.agents/skills/neon-postgres-agent-platforms/SKILL.md)
skill ([neondatabase/neon-for-agent-platforms](https://github.com/neondatabase/neon-for-agent-platforms)):

- **Project-per-tenant.** Every app gets its own dedicated Neon project (complete
  data/compute isolation), provisioned via `@neon/sdk`.
- **Dual-org economics + upgrade.** New apps route to a **sponsored free org** or a
  **paid org**. The workspace's **Upgrade to Paid** button performs a real
  cross-org **project transfer** (free → paid), keeping the data and connection
  string — using a **personal** API key, since org keys can't cross orgs.
- **Compound checkpoints.** A checkpoint is a version record binding **source
  revision** (git commit), **database state** (Neon snapshot + project/branch), and
  the **runnable surface** (sandbox URL) — not a snapshot alone. One-click
  **Restore** rolls back code *and* data together, then reconnects (handling the
  branch-id rotation a finalized restore causes).
- **Consumption metering.** The **Usage** tab reads billing-aligned **v2
  per-project** consumption (`compute_unit_seconds`, storage, egress) — how a
  metered fleet bills each tenant.

## Architecture notes

- **Neon Functions** host the agent because a vibe-coding turn (many LLM + tool calls)
  routinely outlasts lambda-style serverless limits. The function runs next to the control
  Postgres, with `DATABASE_URL` and the AI Gateway credentials injected automatically.
- **`neon.ts`** declares the branch's infrastructure as code — the AI Gateway and the `agent`
  function — deployed with `neon deploy`.
- **Tenant isolation:** each prototype's database is a separate Neon project (free vs paid
  org, routed by the chosen plan), so apps never share data. Snapshots are taken per tenant
  branch with that org's API key.
- **Memory:** the Mastra agent keeps long-term memory in the control Postgres, threaded by
  prototype id and scoped to the owning user.

## Layout

```
app/                     Next.js control app (auth, dashboard, workspace)
  api/prototypes/…       create / provision / token / checkpoints routes
components/              UI (shadcn-style primitives + AI SDK chat workspace)
lib/
  auth.ts                Better Auth (email/password + JWT plugin)
  db/                    Drizzle schema + client (control plane)
  neon.ts                @neon/sdk wrapper: provision tenant DBs, snapshots
  sandbox.ts             Vercel Sandbox helpers + starter app template
  prototypes.ts          control-plane CRUD + provisioning orchestration
neon.ts                  Neon IaC: AI Gateway + the agent function
functions/agent/src/     the Mastra coding agent (Neon Function)
  index.ts               Hono app: JWT verify + AI SDK UI stream
  mastra.ts              Agent + Postgres-backed memory
  tools.ts               file ops, commands, git+snapshot checkpoints
  db.ts                  control-DB access from the function
```

## Local development

```bash
bun install
cp .env.example .env      # fill in the values (see below)

# Control plane schema
bun run db:push           # or apply drizzle/0000_init.sql

# Agent (Neon Function) — deploys the AI Gateway + function to the control branch
neon deploy --env .env    # prints the function's invocation URL

# Control app
bun run dev               # http://localhost:3040
```

### Environment

See **[CONTRIBUTING.md](./CONTRIBUTING.md)** for a step-by-step, CLI-driven guide to
gathering every secret (Neon org keys + control project via `neonctl`, Vercel team/
project ids + a durable access token, Better Auth secret, and the deploy ordering).

See `.env.example` for the full list. In short, you need:

- A **control-plane Neon project** in `us-east-2` (Functions + AI Gateway require a new
  `us-east-2` project on a **paid** plan) — its pooled `DATABASE_URL`, org id, project id,
  and an org API key.
- Two **tenant Neon orgs** (a free-plan and a paid-plan org) with org API keys — the
  databases behind vibe-coded apps.
- A **Vercel** token, team id, and project id for Sandboxes (the control app can use OIDC
  when deployed on Vercel; the agent function needs an explicit token).
- `BETTER_AUTH_SECRET` and the deployed app URL (`BETTER_AUTH_URL` / `AGENT_AUTH_BASE_URL`),
  which is the JWKS issuer/audience the agent verifies against.

## Deploy

- **Agent:** `neon deploy --env .env` (bundles `functions/agent` onto the control branch).
- **Control app:** deploy to Vercel. This repo uses `npm install --legacy-peer-deps` on the
  build host (see `vercel.json`). Set every env var in the Vercel project, and point
  `AGENT_AUTH_BASE_URL` (the function's env) at the deployed app URL.

> This is a demo. It provisions real Neon projects and Vercel Sandboxes; clean them up when
> you're done experimenting.
