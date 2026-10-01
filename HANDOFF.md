# Výprava → filiper.eu — handoff

Tento súbor je prenášací kontext pre pokračovanie práce v projekte **filiper.eu**.

## Cieľ

Minecraft **Paper 26.2** survival plugin + web pre synov domáci server a spolužiakov:

- kampaň (8 kapitol, milníky, vzácne odmeny)
- **denné**, **týždenné**, **dlhodobé** ciele
- **spoločné** ciele (most, ťažba, …) s **príspevkami hráčov**
- party úlohy
- rebríčky
- zobrazenie **in-game** (`/vyprava …`) aj na **webe**
- web stack: **Next.js + Neon Postgres + Vercel**
- doména na Cloudflare: **filiper.eu** (napr. `vyprava.filiper.eu` → Vercel)

## Server

```
Paper version 26.2-124-ver/26.2 (API 26.2.build.124-stable)
Java 25 minimum
```

## Čo je v repo

| Cesta | Obsah |
| --- | --- |
| `src/main/java/sk/vyprava/` | Paper plugin (questy, party, shared goals, Web API) |
| `src/main/resources/quests/` | campaign, daily, weekly, longterm, party, shared YAML |
| `web/` | Next.js dashboard (hráči + admin) |
| `web/neon/` | Neon SQL schéma + demo seed |
| `build.gradle.kts` | paper-api `26.2.build.124-stable`, Java 25 |

### Herné príkazy (cieľ)

- `/vyprava kampan` — postup kampane
- `/vyprava denne` — denné
- `/vyprava tyzdenne` — týždenné
- `/vyprava dlhodobe` — dlhodobé
- `/vyprava spolocne` — serverové spoločné ciele + príspevky
- `/vyprava party …` — partia
- `/vyprava top` — rebríček
- `/vyprava reload` — admin

### Plugin Web API (default port 8765)

- `GET /api/health`
- `GET /api/campaign`, `/api/daily`, `/api/leaderboard`, `/api/players`, `/api/parties`, …
- voliteľný header `X-Vyprava-Token`

### Web

- Public: `/`, `/kampan`, `/denne`, `/party`, `/rebricek`, `/hrac`
- Admin: `/admin` (`VYPRVA_ADMIN_PASSWORD`, default `vyprava`)
- Env: `DATABASE_URL` (Neon pooled), `VYPRVA_ADMIN_PASSWORD`, voliteľne `VYPRVA_PLUGIN_API_URL`
- Dev: `cd web && npm run dev -- -p 43127 -H 0.0.0.0`

## Jazyk / UX

- UI a herné texty: **slovenčina**
- Brand: **Výprava**

## Otvorené / rozpracované

1. Vercel deploy na filiper.eu (`DATABASE_URL` + `VYPRVA_ADMIN_PASSWORD`)
2. Cloudflare DNS: CNAME `vyprava` (alebo root podľa potreby) → Vercel
3. Overiť build JAR na Java 25: `./gradlew jar`
4. Pravidelný sync plugin → Neon (ručný `POST /api/sync` už zapisuje hráčov, rebríček a spoločné ciele)
5. Admin na webe: quest pooly sa stále ukladajú do lokálneho JSON; do Neon ide len `admin_settings`

## Ako pokračovať v projekte filiper.eu

1. Otvor nového Cloud Agenta **na repo filiper.eu** (nie na dočasnom draft repo).
2. Skopíruj obsah tohto súboru do prvého promptu, alebo pushni tento commit do filiper.eu.
3. Pokračuj: Vercel, DNS, test JAR na Paper 26.2. Neon schéma je v `web/neon/`.

## Kontakt / vlastník

Miroslav Fedurco — domáci Paper server pre syna a spolužiakov.
