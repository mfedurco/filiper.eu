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
/vyprava jazyk sk|en
/vyprava prepojit
/vyprava reload   # admin
```

### HTTP JSON API (for web / Supabase sync)

The legacy API is disabled by default. If it is still needed, bind it to a private
interface and set a long random `web.api-token`; it refuses to start without one.
The portal/server-key path does not use this listener.

- `GET /api/health`
- `GET /api/campaign|daily|weekly|longterm|shared|party-quests`
- `GET /api/leaderboard|players|parties`

Clients send `X-Vyprava-Token`. Browser CORS is off unless one exact
`web.cors-origin` is configured.

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
- `APP_ORIGIN` — canonical portal origin, normally `https://vyprava.filiper.eu`. OAuth and write-origin checks do not trust forwarded host headers.
- `ADMIN_SECRET` — known only to the person who saves the first Google account as `spravca` with every server. It is not a shared admin password.
- `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` — the existing Google OAuth client. Sign-in starts at `/api/auth/google` and returns through `/api/auth/google/callback`. Production redirect URI is `https://vyprava.filiper.eu/api/auth/google/callback`. If either value is missing, Google sign-in stays off and `/admin` does not write.

The database schema is the plugin's (`expeditions`, `quest_definitions`, server scope). This app does not create a second schema.

### Admin

`/admin` signs in with the existing Google account. A `spravca` sees the servers they cover (`all_servers`, or the listed server ids). A `hráč` or an unknown Google account cannot administer. The first `spravca` is the signed-in Google account that still knows `ADMIN_SECRET`; that account is saved with every server. Later, a `spravca` with every server can change another already-signed-in account’s role.

The screen stays a server list: each server shows its active expedition, dates, and status. Opening a server lists that server’s expeditions. An expedition opens as two panes: a folder tree (kampaň, denné, týždenné, dlhodobé, spoločné, party) and the quest cards for the selected folder. Fields and quests can be edited only while the expedition is a draft. An active or ended expedition is copied into a new draft before it changes. Drafts can be generated from `web/data/matrices/` or copied onto the same or another server. Only one expedition is active per server. Accounts live in `portal_accounts`.

### Public routes

`/`, `/kampan`, `/denne`, `/tyzdenne`, `/dlhodobe`, `/spolocne`, `/party`, `/rebricek`, `/hrac`, `/admin`

`GET /api/public/{serverId}` is a read-only JSON snapshot of that server’s active expedition (name, blurb, quest names) and leaderboard (player, points). It does not return admin data. Missing data is an empty expedition or leaderboard, not an error. CORS allows `https://filiper.eu` and `https://www.filiper.eu`.

### Deploy on Vercel + Cloudflare (`filiper.eu`)

1. Import the repo in Vercel; **Root Directory** = `web`.
2. Add `DATABASE_URL`, `APP_ORIGIN`, `ADMIN_SECRET`, `GOOGLE_CLIENT_ID`, and `GOOGLE_CLIENT_SECRET` from `.env.example`.
3. Deploy → note the `*.vercel.app` URL.
4. In **Cloudflare DNS** for `filiper.eu`:
   - Type **CNAME**, Name `vyprava` (or `@` / preferred host), Target `cname.vercel-dns.com` (or the hostname Vercel shows).
   - Proxy status: DNS only (grey) or Proxied (orange) — both work; if Proxied, SSL mode Full (strict).
5. In Vercel → Project → Domains → add `vyprava.filiper.eu` (or `filiper.eu` / path via rewrite).
6. Wait for certificate + DNS propagation.

### Database changes and recovery

Apply `web/neon/*.sql` in numeric order through a reviewed deployment step. Never
run migrations from a public request. Before each migration, create a Neon restore
point (or verify point-in-time recovery), and periodically test a restore into a
separate branch. `007_security_hardening.sql` must be applied before a public
launch; it adds credential/claim constraints and indexes.

Keep `DATABASE_URL`, `ADMIN_SECRET`, Google credentials, and raw server keys only
in the deployment/server secret stores. Rotate a server key in `/admin` after any
suspected disclosure. The portal has no complete alerting stack yet: operations
must monitor Vercel error rates, Neon connection/storage limits, and failed plugin
sync warnings. A `200` from `/api/public/{serverId}` proves only that the public
route responded; verify that an expected active expedition and recent leaderboard
data are present as the application-level health check.

## Repo layout

```
src/main/java/sk/vyprava/   Paper plugin
src/main/resources/quests/  YAML goal pools
web/                        Next.js App Router dashboard
web/supabase/               SQL migration + seed
```

## License / notes

Slovak copy throughout. Designed for a classroom survival server — keep rewards fun, not P2W.
