# Výprava Web

Next.js App Router + TypeScript + Tailwind + **Neon Postgres** dashboard for the Výprava Paper plugin.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
# → http://localhost:43127
```

Demo JSON under `data/` powers the UI when `DATABASE_URL` is unset. `npm run build` does not connect to a database.

## Env

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon **pooled** connection string (server-only) |
| `VYPRVA_ADMIN_PASSWORD` | `/admin` cookie secret |
| `VYPRVA_PLUGIN_API_URL` | Paper plugin base (`http://host:8765`) |
| `VYPRVA_PLUGIN_API_TOKEN` | Optional `X-Vyprava-Token` |

## Neon

```bash
# In the Neon SQL editor:
# 1) neon/001_init.sql
# 2) neon/002_seed.sql   # demo rows; truncates app tables
```

Tables: `players`, `goals`, `milestones`, `player_progress`, `contributions`, `shared_goal_state`, `leaderboard_snapshot`, `admin_settings`.

No RLS. Keep `DATABASE_URL` off the client.

## Vercel + Cloudflare

- Vercel root directory: `web`
- Env: `DATABASE_URL` and `VYPRVA_ADMIN_PASSWORD` (see `.env.example`)
- Cloudflare DNS: CNAME `vyprava` → `cname.vercel-dns.com` for **filiper.eu**
- Add domain in Vercel project settings

See root [README](../README.md) for full deploy steps.
