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

### HTTP JSON API (for web / Supabase sync)

Enabled by default on port **8765**:

- `GET /api/health`
- `GET /api/campaign|daily|weekly|longterm|shared|party-quests`
- `GET /api/leaderboard|players|parties`

CORS is open for the dashboard. Optional `web.api-token` → clients send `X-Vyprava-Token`.

## Web (Next.js + Neon)

Source: [`web/`](web/). Public pages stay on the Hlbina look and read the live expedition from Neon. `/admin` is a separate light screen.

### Local

```bash
cd web
cp .env.example .env.local
npm install
npm run dev                  # http://127.0.0.1:43141
```

### Env

Set in `.env.local` or the host, never commit the values:

- `DATABASE_URL` — pooled Neon connection for the Next.js server. If it is missing, public pages stay empty instead of crashing.
- `ADMIN_SECRET` — shared password for `/admin`. If it is missing, admin is locked and does not write.

The database schema is the plugin's (`expeditions`, `quest_definitions`, server scope). This app does not create a second schema.

### Admin

`/admin` lists servers and expeditions (návrh / aktívna / skončená) with from–to dates. An expedition opens as quest cards grouped by kind. Drafts can be generated from `web/data/matrices/` or copied onto the same or another server. Only one expedition is active per server.

### Public routes

`/`, `/kampan`, `/denne`, `/tyzdenne`, `/dlhodobe`, `/spolocne`, `/party`, `/rebricek`, `/hrac`, `/admin`

### Deploy on Vercel + Cloudflare (`filiper.eu`)

1. Import the repo in Vercel; **Root Directory** = `web`.
2. Add `DATABASE_URL` and `ADMIN_SECRET` from `.env.example`.
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
web/supabase/               SQL migration + seed
```

## License / notes

Slovak copy throughout. Designed for a classroom survival server — keep rewards fun, not P2W.
