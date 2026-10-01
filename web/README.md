# Výprava Web

Next.js (App Router) + TypeScript + Tailwind frontend pre Minecraft Paper plugin **Výprava**.

## Spustenie

```bash
cd web
npm install
npm run dev
```

Dev server beží na **http://0.0.0.0:43127** (port `43127`).

Ďalšie skripty:

- `npm run build` – produkčný build
- `npm start` – spustenie buildu na porte 43127

## Admin

- URL: `/admin`
- Heslo z env: `VYPRVA_ADMIN_PASSWORD` (default lokálne: `vyprava`)

```bash
VYPRVA_ADMIN_PASSWORD=vyprava npm run dev
```

Admin ukladá JSON do `data/quests/` (`campaign.json`, `daily.json`, `party.json`, `settings.json`) a synchronizuje aj zrkadlá v `data/`. Paper plugin môže tieto súbory syncnúť / konvertovať späť do YAML.

## Dáta

| Súbor | Obsah |
| --- | --- |
| `data/campaign.json` / `data/quests/campaign.json` | 8 kapitol kampane |
| `data/daily.json` / `data/quests/daily.json` | Denný pool |
| `data/party.json` / `data/quests/party.json` | Party pool |
| `data/leaderboard.json` | Demo rebríček |
| `data/progress-demo.json` | Demo postup hráča |
| `data/quests/settings.json` | Prepínače odmien / bodov / min. kapitoly |

Ak je nastavené `NEXT_PUBLIC_VYPRVA_API_URL`, app sa najprv pokúsi načítať live dáta z plugin API; inak používa lokálne JSON.

## Verejné routy

- `/` – hero / landing
- `/kampan` – roadmapa kampane
- `/denne` – denný pool
- `/party` – party pool
- `/rebricek` – rebríček
- `/hrac` – demo postup hráča
- `/admin` – editor questov

API (lokálne JSON):

- `GET /api/quests/campaign|daily|party`
- `GET /api/leaderboard`
- `GET /api/progress`
- `POST/DELETE /api/admin/login`
- `GET/PUT /api/admin/quests`
