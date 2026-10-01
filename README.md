# Výprava

Paper **26.2** quest plugin + public web app for a kids survival server.

In-game goals and leaderboards stay visible via `/vyprava …` and on the web (Next.js + Supabase + Vercel), planned on **filiper.eu** (e.g. `vyprava.filiper.eu`).

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
# → build/libs/filiper.eu-vyprava.jar
```

### Install

1. Copy `build/libs/filiper.eu-vyprava.jar` into the Paper `plugins/` folder.
2. Start Paper `26.2-124` (Java 25).
3. Edit `plugins/filiper.eu-vyprava/config.yml` (counts, timezone, web API).
4. Quest definitions are **not** loaded from YAML. They come from the active expedition in Postgres (`web/neon/002_expeditions.sql`). Set `database.enabled: true` and a direct `database.jdbc-url`, or export `DATABASE_URL_UNPOOLED` (the plugin also reads `.env.local` next to the server). Leave the URL empty in git. YAML under `plugins/filiper.eu-vyprava/data/` is only the player-progress outbox: every change is saved there first and pushed asynchronously, retrying until Neon accepts it.
5. The plugin checks expedition `starts_at` / `ends_at` in `Europe/Bratislava` on startup and about once a minute. The window that contains now becomes the single active expedition.

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

### HTTP JSON API (for web / Supabase sync)

Enabled by default on port **8765**:

- `GET /api/health`
- `GET /api/campaign|daily|weekly|longterm|shared|party-quests`
- `GET /api/leaderboard|players|parties`

CORS is open for the dashboard. Optional `web.api-token` → clients send `X-Vyprava-Token`.

## Web (Next.js + Supabase + Vercel)

Source: [`web/`](web/).

### Local

```bash
cd web
cp .env.example .env.local   # optional Supabase; demo JSON works without it
npm install
npm run dev                  # http://localhost:43127
```

Without Supabase env vars the UI loads **demo seed** from `web/data/` (including shared contributions).

### Supabase

1. Create a project.
2. Run `web/supabase/migrations/001_init.sql` then `web/supabase/seed.sql`.
3. Set in Vercel / `.env.local`:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (sync + admin settings write)
   - `VYPRVA_ADMIN_PASSWORD`
   - optional `VYPRVA_PLUGIN_API_URL` (+ token)

**RLS:** public `SELECT` on goals, leaderboard, contributions; writes via **service role** only.

**Sync:** `POST /api/sync` with header `X-Vyprava-Admin: <VYPRVA_ADMIN_PASSWORD>` pulls plugin API → Supabase.

### Admin

`/admin` — password from `VYPRVA_ADMIN_PASSWORD` (default `vyprava`). Configure pools / settings; persists to `web/data/quests/` and settings into Supabase when service role is set.

### Public routes

`/`, `/kampan`, `/denne`, `/tyzdenne`, `/dlhodobe`, `/spolocne`, `/party`, `/rebricek`, `/hrac`, `/admin`

### Deploy on Vercel + Cloudflare (`filiper.eu`)

1. Import the repo in Vercel; **Root Directory** = `web`.
2. Add env vars from `.env.example`.
3. Deploy → note the `*.vercel.app` URL.
4. In **Cloudflare DNS** for `filiper.eu`:
   - Type **CNAME**, Name `vyprava` (or `@` / preferred host), Target `cname.vercel-dns.com` (or the hostname Vercel shows).
   - Proxy status: DNS only (grey) or Proxied (orange) — both work; if Proxied, SSL mode Full (strict).
5. In Vercel → Project → Domains → add `vyprava.filiper.eu` (or `filiper.eu` / path via rewrite).
6. Wait for certificate + DNS propagation.

## Repo layout

```
src/main/java/sk/vyprava/   Paper plugin
src/main/resources/quests/  Historical quest copy, seeded into Neon (not loaded at runtime)
web/                        Next.js App Router dashboard
web/neon/                   Expedition schema + seed
web/supabase/               Original SQL migration + demo seed
```

## License / notes

Slovak copy throughout. Designed for a classroom survival server — keep rewards fun, not P2W.
