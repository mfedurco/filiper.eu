# Výprava

Paper **26.2** quest plugin + public web app for a kids survival server.

In-game goals and leaderboards stay visible via `/vyprava …` and on the web (Next.js + Neon Postgres + Vercel), planned on **filiper.eu** (e.g. `vyprava.filiper.eu`).

## Goal types

| Type | In-game | Description |
|------|---------|-------------|
| **Kampaň** | `/vyprava kampan` | Progressive chapters + milestones + rare rewards |
| **Denné** | `/vyprava denne` | Rotating daily personal goals |
| **Týždenné** | `/vyprava tyzdenne` | Weekly rotation |
| **Dlhodobé** | `/vyprava dlhodobe` | Seasonal / long-term goals |
| **Spoločné** | `/vyprava spolocne` | Server-wide shared objectives with **per-player contributions** |
| **Party** | `/vyprava party` | Party shared quest + contribution map |
| **Top** | `/vyprava top` | Leaderboard |

Shared goals (and party quests) track `player → amount`, broadcast on completion, and grant shared rewards to contributors.

## Plugin (Paper 26.2 / Java 25)

### Build

Requires **Gradle 9.1+** (wrapper included). Ubuntu OpenJDK `25.0.4.1` breaks older Gradle version parsers; this wrapper uses 9.1.

```bash
./gradlew jar
# → build/libs/Vyprava-1.0.0.jar
```

### Install

1. Copy `build/libs/Vyprava-1.0.0.jar` into the Paper `plugins/` folder.
2. Start Paper `26.2-124` (Java 25).
3. Edit `plugins/Vyprava/config.yml` (counts, timezone, web API).
4. Quest YAML lives under `plugins/Vyprava/quests/` (`campaign`, `daily`, `weekly`, `longterm`, `party`, `shared`).

### Commands

```
/vyprava kampan
/vyprava denne
/vyprava tyzdenne
/vyprava dlhodobe
/vyprava spolocne
/vyprava party create|invite|leave
/vyprava top
/vyprava reload   # admin
```

### HTTP JSON API (for web / Neon sync)

Enabled by default on port **8765**:

- `GET /api/health`
- `GET /api/campaign|daily|weekly|longterm|shared|party-quests`
- `GET /api/leaderboard|players|parties`

CORS is open for the dashboard. Optional `web.api-token` → clients send `X-Vyprava-Token`.

## Web (Next.js + Neon + Vercel)

Source: [`web/`](web/).

### Local

```bash
cd web
cp .env.example .env.local   # optional Neon; demo JSON works without it
npm install
npm run dev                  # http://localhost:43127
```

Without `DATABASE_URL` the UI loads **demo seed** from `web/data/` (including shared contributions). `npm run build` does not open a database connection.

### Neon Postgres

1. Create a Neon project and copy the **pooled** connection string (host contains `-pooler`).
2. In the Neon SQL editor, run `web/neon/001_init.sql`, then `web/neon/002_seed.sql` for demo rows.
3. Set in Vercel / `.env.local`:
   - `DATABASE_URL` (pooled connection string; server-only — do not use `NEXT_PUBLIC_`)
   - `VYPRVA_ADMIN_PASSWORD`
   - optional `VYPRVA_PLUGIN_API_URL` (+ token)

There is no Row Level Security. The Neon role behind `DATABASE_URL` can read and write every table the app uses.

**Sync:** `POST /api/sync` with header `X-Vyprava-Admin: <VYPRVA_ADMIN_PASSWORD>` pulls the plugin API into Neon.

### Admin

`/admin` — password from `VYPRVA_ADMIN_PASSWORD` (default `vyprava`). Configure pools / settings; persists to `web/data/quests/`. Settings also upsert into Neon `admin_settings` when `DATABASE_URL` is set.

### Public routes

`/`, `/kampan`, `/denne`, `/tyzdenne`, `/dlhodobe`, `/spolocne`, `/party`, `/rebricek`, `/hrac`, `/admin`

### Deploy on Vercel + Cloudflare (`filiper.eu`)

1. Import the repo in Vercel; **Root Directory** = `web`.
2. Add env vars from `.env.example` (`DATABASE_URL`, `VYPRVA_ADMIN_PASSWORD`, optional plugin URL).
3. Deploy → note the `*.vercel.app` URL.
4. In **Cloudflare DNS** for `filiper.eu`:
   - Type **CNAME**, Name `vyprava` (or `@` / preferred host), Target `cname.vercel-dns.com` (or the hostname Vercel shows).
   - Proxy status: DNS only (grey) or Proxied (orange) — both work; if Proxied, SSL mode Full (strict).
5. In Vercel → Project → Domains → add `vyprava.filiper.eu` (or `filiper.eu` / path via rewrite).
6. Wait for certificate + DNS propagation.

## Repo layout

```
src/main/java/sk/vyprava/   Paper plugin
src/main/resources/quests/  YAML goal pools
web/                        Next.js App Router dashboard
web/neon/                   Neon SQL schema + demo seed
```

## License / notes

Slovak copy throughout. Designed for a classroom survival server — keep rewards fun, not P2W.
