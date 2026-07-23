# Vibe — a codegen platform built on Neon

A reference app for the [Neon Agent Program](https://neon.com/agents): users
describe an app in chat, a coding agent builds it live, and **every app gets
its own isolated Neon Postgres project** — with checkpoints that version code
and data together.

| Layer            | Tech                                                                            |
| ---------------- | ------------------------------------------------------------------------------- |
| Web app          | **Next.js 15** (App Router) on **Vercel** (`apps/web`)                          |
| API              | oRPC, mounted as Next route handlers (`packages/api`, `apps/web/src/app/api`)   |
| Auth             | **Better Auth** + Drizzle on Neon Postgres (`packages/auth`, `packages/db`)     |
| Coding agent     | **Mastra** on a **Neon Function** (`apps/agent`)                                |
| LLM              | **Neon AI Gateway** (one credential, any model)                                 |
| Per-app database | A **Neon project per app** via **@neon/sdk** (`packages/neon`)                  |
| App runtime      | **Vercel Sandboxes** (`packages/sandbox`)                                       |
| UI               | shadcn / Base UI / Tailwind v4 + [neon ui](https://ui.neon.com) (`packages/ui`) |

## Prerequisites

- [Bun](https://bun.sh) 1.1+
- A [Neon](https://console.neon.tech) account
- A [Vercel](https://vercel.com) account with Sandboxes access

### Neon side

You need **one control-plane project** and **two tenant orgs**:

1. **Control-plane project** — holds the app's own database (auth, prototypes,
   checkpoints) and the AI Gateway. Create a project, note its id, and copy
   the pooled connection string (`DATABASE_URL`).
2. **Free tenant org** — a free-plan org where sponsored user databases are
   provisioned. Create an org-scoped API key.
3. **Paid tenant org** — a paid-plan org that apps move to on upgrade
   (a real cross-org project transfer). Create an org-scoped API key.
4. **Personal API key** — account-level, required for the cross-org transfer
   (org keys cannot move projects between orgs).
5. **AI Gateway** — enable it on the control project's main branch
   (Console → project → branch → AI Gateway) and request the models you want.
   The default is `neon/claude-sonnet-4-6`; `neon/gpt-oss-120b` works without
   special access.

### Vercel side

1. A Vercel **team** and a **project** (used to scope sandboxes).
2. A **personal access token** with sandbox permissions.
3. Note the team id (`team_...`) and project id (`prj_...`).

## Configure

```bash
cp .env.example .env
```

Fill it in (each variable is documented inline):

| Variable                                                                   | What                                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `DATABASE_URL`                                                             | Pooled connection string of the control-plane project                  |
| `BETTER_AUTH_SECRET`                                                       | `openssl rand -base64 32`                                              |
| `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL`                                  | `http://localhost:3001` in dev                                         |
| `NEON_CONTROL_API_KEY` / `NEON_CONTROL_ORG_ID` / `NEON_CONTROL_PROJECT_ID` | Control-plane org + project                                            |
| `NEON_PERSONAL_API_KEY`                                                    | Cross-org transfer on upgrade                                          |
| `NEON_FREE_ORG_ID` / `NEON_FREE_API_KEY`                                   | Sponsored tenant org                                                   |
| `NEON_PAID_ORG_ID` / `NEON_PAID_API_KEY`                                   | Paid tenant org                                                        |
| `VERCEL_TOKEN` / `VERCEL_TEAM_ID` / `VERCEL_PROJECT_ID`                    | Sandboxes                                                              |
| `NEXT_PUBLIC_AGENT_URL`                                                    | Agent function URL (`http://localhost:8788` in dev, no trailing slash) |

Push the schema once:

```bash
bun run db:push
```

## Run locally

Two processes:

```bash
# 1. Web app — http://localhost:3001
bun run dev

# 2. Coding agent (Neon Function, local) — http://localhost:8788
set -a; source .env; set +a; bun run agent:dev
```

Next reads `.env` from the repo root on its own; `neon dev` does **not** —
source it first for the agent. `NEXT_PUBLIC_*` values are inlined at
build/dev start, so changing them means restarting the web process.

Open http://localhost:3001, type a prompt, and watch it provision a Neon
project + sandbox and start building.

### Test drive

Paste this as the first agent prompt — it exercises the full Neon story in
one turn: Drizzle schema on the tenant's own Neon Postgres, seeded data,
server actions, and a compound checkpoint (git commit + Neon snapshot):

```text
Turn this into a guestbook. Define a `messages` table (id, name, message,
created_at) with Drizzle in lib/schema.ts, keep ensureSchema() in lib/db.ts
in sync, and use the Neon serverless driver that's already wired to
DATABASE_URL. Seed three sample messages. List messages newest-first in a
Server Component and add a form that inserts through a Server Action. When
it works, create a checkpoint labeled "guestbook v1".
```

Then verify the platform loop:

1. The preview shows the guestbook with the three seeded rows.
2. **Checkpoints & usage** (database icon in the preview chrome) lists
   `guestbook v1` with a sha and a snapshot dot.
3. Add a message through the form, then **Restore** the checkpoint — the
   new row disappears: code AND data rolled back together.

## Deploy

- **Web**: `bun run deploy:prod` (Vercel; sync env with `bun run env:production`).
- **Agent**: `bun run agent:deploy` (Neon Functions), then point
  `NEXT_PUBLIC_AGENT_URL` at the deployed function URL. The function gets the
  `DATABASE_URL` of the branch it deploys to injected automatically — make
  sure the schema is pushed to THAT branch (`bun run db:push` against it),
  or the agent and the web app will read different databases.

## Layout

```
apps/web/src/app        Next.js App Router shell — pages, server layouts
                        (auth guard), and the /api/auth + /api/rpc mounts
apps/web/src/components The product UI (client components)
apps/web/src/lib        server.ts: session + in-process oRPC caller
apps/agent              Mastra coding agent (Hono on Neon Functions)
packages/*              api · auth · db · env · neon · sandbox · ui
```

## Troubleshooting

| Symptom           | Fix                                                                     |
| ----------------- | ----------------------------------------------------------------------- |
| Chat 401s         | Agent process died or can't reach the app's JWKS — restart `agent:dev`  |
| Chat 404s         | Trailing slash in `NEXT_PUBLIC_AGENT_URL` — strip it and restart        |
| `unknown model`   | Model not enabled on your gateway — set `AGENT_MODEL=neon/gpt-oss-120b` |
| Empty usage panel | Metering lags after provisioning or a transfer — wait a few minutes     |
| DB errors         | Check `DATABASE_URL`, re-run `bun run db:push`                          |
