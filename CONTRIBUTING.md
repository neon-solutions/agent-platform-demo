# Contributing

Thanks for hacking on this demo codegen platform. This guide focuses on the one
genuinely fiddly part: **gathering every secret the app needs**, using the Neon
and Vercel CLIs (plus one dashboard step for the Vercel token).

Copy `.env.example` to `.env` and fill it in as you go:

```bash
cp .env.example .env
```

The variables fall into four groups: **control-plane Neon**, **tenant Neon orgs**,
**Vercel**, and **Better Auth / URLs**. There's a mild chicken-and-egg between the
app URL and the agent URL — the [order of operations](#order-of-operations) at the
end walks through it.

Prerequisites:

```bash
npm i -g neon      # Neon CLI (provides `neon` and `neonctl`)
npm i -g vercel    # Vercel CLI
neonctl auth       # opens a browser to log in
vercel login       # opens a browser to log in
```

---

## 1. Control-plane Neon (Postgres + Functions + AI Gateway)

The control plane needs a **new project in `us-east-2` on a paid plan** — Neon
Functions and the AI Gateway are only available on new `us-east-2` projects, and
the AI Gateway's foundation models require a paid plan.

**Find your org id** (`NEON_CONTROL_ORG_ID`):

```bash
neonctl orgs list
```

**Create the control project** (`NEON_CONTROL_PROJECT_ID`):

```bash
neonctl projects create \
  --name agent-platform-control \
  --region-id aws-us-east-2 \
  --org-id <NEON_CONTROL_ORG_ID> \
  --output json
# → .project.id  is NEON_CONTROL_PROJECT_ID
```

**Get the pooled connection string** (`DATABASE_URL`):

```bash
neonctl connection-string \
  --project-id <NEON_CONTROL_PROJECT_ID> \
  --pooled
```

**Create an org-scoped API key** (`NEON_CONTROL_API_KEY`). There's no first-class
CLI command, so use the authenticated API passthrough:

```bash
neonctl api /organizations/<NEON_CONTROL_ORG_ID>/api_keys \
  --method POST \
  --data '{"key_name":"agent-platform-demo-control"}'
# → .key  is NEON_CONTROL_API_KEY  (shown once — copy it now)
```

> `NEON_AI_GATEWAY_TOKEN` and `NEON_AI_GATEWAY_BASE_URL` are **not** set by hand.
> `neon deploy` (and `neon env pull`) provision the gateway and write them into
> your `.env` automatically. Likewise `NEXT_PUBLIC_AGENT_URL` comes from
> `neon deploy` — see [step 4](#4-deploy-the-agent-and-capture-its-url).

---

## 2. Tenant Neon orgs (the databases behind vibe-coded apps)

Every generated app gets its own Neon project, provisioned into one of two orgs:
a **free-plan** org and a **paid-plan** org. You need each org's id and an
org-scoped API key.

```bash
neonctl orgs list   # pick your free-plan and paid-plan orgs
```

```bash
# Free-plan org → NEON_FREE_ORG_ID / NEON_FREE_API_KEY
neonctl api /organizations/<NEON_FREE_ORG_ID>/api_keys \
  --method POST --data '{"key_name":"agent-platform-demo-free"}'

# Paid-plan org → NEON_PAID_ORG_ID / NEON_PAID_API_KEY
neonctl api /organizations/<NEON_PAID_ORG_ID>/api_keys \
  --method POST --data '{"key_name":"agent-platform-demo-paid"}'
```

> The two orgs can be the same org while prototyping; the platform just routes new
> apps by the plan the user picks. For the "paid" tier's databases to get paid
> features, that org must actually be on a paid Neon plan.

---

## 3. Vercel (Sandboxes + the control-app project)

### Team id (`VERCEL_TEAM_ID`)

The CLI shows team **slugs**, not ids, so read the id from the API. First get a
token (below) or reuse `vercel whoami`; then:

```bash
curl -s -H "Authorization: Bearer <VERCEL_TOKEN>" \
  "https://api.vercel.com/v2/teams" \
  | python3 -c 'import sys,json;[print(t["id"],t["slug"]) for t in json.load(sys.stdin)["teams"]]'
# → the id (team_...) for the team you want is VERCEL_TEAM_ID
```

### Project id (`VERCEL_PROJECT_ID`)

Link (or create) the project, then read it from `.vercel/project.json`:

```bash
vercel link            # select/create the "agent-platform-demo" project + team
cat .vercel/project.json   # → .projectId is VERCEL_PROJECT_ID
```

### Vercel access token (`VERCEL_TOKEN`)

The control app can use Vercel's injected **OIDC** token when it runs on Vercel,
but the **agent runs off-Vercel on a Neon Function**, so it needs a real,
long-lived access token. The CLI's cached OAuth token is short-lived — mint a
durable one in the dashboard:

1. Open **https://vercel.com/account/settings/tokens** (Account Settings → Tokens).
2. Click **Create Token**:
   - **Name:** `agent-platform-demo`
   - **Scope:** the team that owns the sandboxes/project (matches `VERCEL_TEAM_ID`).
   - **Expiration:** a long window (e.g. **No Expiration** or 1 year) so it doesn't
     lapse like the CLI token.
3. **Create**, then **copy the value once** → `VERCEL_TOKEN`.

Verify it works:

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer <VERCEL_TOKEN>" https://api.vercel.com/v2/user
# → 200
```

> Keep the token only in `.env` (git-ignored), the Vercel project env, and the Neon
> Function env — never commit it.

---

## 4. Better Auth + URLs

**Secret** (`BETTER_AUTH_SECRET`):

```bash
openssl rand -base64 32
```

**URLs** — set all three to your deployed control-app URL once you know it (locally
they default to `http://localhost:3040`):

- `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` — the control app's public URL.
- `AGENT_AUTH_BASE_URL` — same URL; it's the JWKS issuer/audience the agent
  verifies caller JWTs against. After a Vercel deploy, find the production URL with:

  ```bash
  vercel inspect <deployment-url> | grep -i alias
  # or read it from the `vercel deploy --prod` output
  ```

---

## Order of operations

Because the agent needs the app's URL (for JWKS) and the app needs the agent's URL
(baked in at build time as `NEXT_PUBLIC_*`), do this once:

1. Fill in everything from steps 1–4 above **except** `NEXT_PUBLIC_AGENT_URL` and the
   final URLs.
2. **Push the control schema:** `bun run db:push` (or apply `drizzle/0000_init.sql`).
3. **Deploy the agent:** `neon deploy --env .env`. This provisions the AI Gateway,
   deploys the function, prints its invocation URL (→ `NEXT_PUBLIC_AGENT_URL`), and
   writes `NEON_AI_GATEWAY_*` into `.env`.
4. **Deploy the app to Vercel** with all env vars set; note its production URL.
5. Set `BETTER_AUTH_URL` / `NEXT_PUBLIC_APP_URL` / `AGENT_AUTH_BASE_URL` to that URL,
   **re-deploy the agent** (`neon deploy --env .env`) so it verifies JWTs against the
   live JWKS, and re-deploy the app so the client picks up `NEXT_PUBLIC_AGENT_URL`.

For local development, `bun run dev` serves the app at `http://localhost:3040`; the
agent still runs as the deployed Neon Function (point `NEXT_PUBLIC_AGENT_URL` at it),
or run it locally with `neon dev`.

> Provisioning patterns (dual free/paid-org fleets, per-tenant projects, project
> transfer, compound git+snapshot checkpoints, Consumption API) follow the vendored
> [`neon-postgres-agent-platforms`](.agents/skills/neon-postgres-agent-platforms/SKILL.md)
> skill from
> [neondatabase/neon-for-agent-platforms](https://github.com/neondatabase/neon-for-agent-platforms).
