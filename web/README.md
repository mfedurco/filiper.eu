# Výprava web

Next.js portál pre hráčov (vzhľad Hlbina) a svetlý admin výprav. Verejné stránky čítajú živých hráčov, postup a aktívnu výpravu z Neon Postgres. Schéma tabuliek je tá z pluginu (`expeditions`, `quest_definitions`, `servers` a súvisiace tabuľky). Web si nevymýšľa druhú schému a migrácie nespúšťa.

Predvolený server-id je `test`. Ak je serverov viac, v hlavičke je prepínač.

## Spustenie

```bash
cd web
npm install
npm run dev
# http://127.0.0.1:43141
```

## Premenné

| Premenná | Účel |
|----------|------|
| `DATABASE_URL` | Pooled Neon connection string pre serverové čítanie a zápis. Nikdy do klienta. |
| `ADMIN_SECRET` | Spoločné heslo pre `/admin`. Ak chýba, admin je zamknutý a nezapisuje. |

Hodnoty patria do `.env.local`, nie do gitu. Ak `DATABASE_URL` na nasadení chýba, verejné stránky ostanú v prázdnom stave a nespadnú.

## Admin

`/admin` je svetlý a bez Minecraft vzhľadu. Domov je zoznam serverov: pri každom je aktívna výprava, dátumy a stav. Server sa otvorí na svoje výpravy (návrh / aktívna / skončená). Výprava má vľavo priečinky (kampaň, denné, týždenné, dlhodobé, spoločné, party) a vpravo karty vybraného priečinka. Karty sa dajú pridať, upraviť a odstrániť.

Nový návrh sa skladá z matríc v `data/matrices/` (témy, činnosti, materiály, vzory mien). Kópia výpravy je nový návrh na tom istom alebo inom serveri. Na jednom serveri beží naraz jedna výprava. Spustenie rešpektuje `starts_at` / `ends_at`.

## Verejné stránky

`/`, `/kampan`, `/denne`, `/tyzdenne`, `/dlhodobe`, `/spolocne`, `/party`, `/rebricek`, `/hrac`
