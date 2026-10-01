# Výprava Web

Next.js App Router + TypeScript + Tailwind + **Supabase** dashboard for the Výprava Paper plugin.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
# → http://localhost:43127
```

Demo JSON under `data/` powers the UI when Supabase is not configured.

## Env

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key (RLS read) |
| `SUPABASE_SERVICE_ROLE_KEY` | Sync + admin writes |
| `VYPRVA_ADMIN_PASSWORD` | `/admin` cookie secret |
| `VYPRVA_PLUGIN_API_URL` | Paper plugin base (`http://host:8765`) |
| `VYPRVA_PLUGIN_API_TOKEN` | Optional `X-Vyprava-Token` |

## Supabase

```bash
# In Supabase SQL editor:
# 1) supabase/migrations/001_init.sql
# 2) supabase/seed.sql
```

Tables: `players`, `goals`, `milestones`, `player_progress`, `contributions`, `shared_goal_state`, `leaderboard_snapshot`, `admin_settings`.

## Vercel + Cloudflare

- Vercel root directory: `web`
- Cloudflare DNS: CNAME `vyprava` → `cname.vercel-dns.com` for **filiper.eu**
- Add domain in Vercel project settings

See root [README](../README.md) for full deploy steps.
