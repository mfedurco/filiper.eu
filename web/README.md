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
| `APP_ORIGIN` | Pevný verejný origin pre OAuth a kontrolu pôvodu zápisov. |
| `ADMIN_SECRET` | Jednorazové heslo na vytvorenie prvého Google správcu. Nie je to admin login. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google OAuth pre hráčske profily a správu. |
| `RATE_LIMIT_SECRET` | Náhodný spoločný HMAC secret (min. 32 bajtov) pre distribuované limity. |
| `HEALTH_SECRET` | Samostatný secret pre podrobný `/api/health`. |
| `CRON_SECRET` | Samostatný secret pre denný cleanup. |
| `PLUGIN_SYNC_STALE_MINUTES` | Voliteľná hranica neaktívneho pluginu, predvolene 5 minút. |

Hodnoty patria do `.env.local`, nie do gitu. Ak `DATABASE_URL` na nasadení chýba, verejné stránky ostanú v prázdnom stave a nespadnú.

## Admin

`/admin` je svetlý a bez Minecraft vzhľadu. Prihlasuje Google účet s rolou
`spravca`; každý zápis znova kontroluje rolu aj rozsah serverov. `ADMIN_SECRET`
slúži iba na prvé vytvorenie správcu. Domov je zoznam serverov: pri každom je
aktívna výprava, dátumy a stav. Server sa otvorí na svoje výpravy (návrh /
aktívna / skončená). Výprava má vľavo priečinky (kampaň, denné, týždenné,
dlhodobé, spoločné, party) a vpravo karty vybraného priečinka. Karty sa dajú
pridať, upraviť a odstrániť iba v návrhu.

Nový návrh sa skladá z matríc v `data/matrices/` (témy, činnosti, materiály, vzory mien). Kópia výpravy je nový návrh na tom istom alebo inom serveri. Na jednom serveri beží naraz jedna výprava. Spustenie rešpektuje `starts_at` / `ends_at`.

## Verejné stránky

`/`, `/kampan`, `/denne`, `/tyzdenne`, `/dlhodobe`, `/spolocne`, `/party`, `/rebricek`, `/hrac`

`GET /api/public/{serverId}` vráti len aktívnu výpravu a rebríček toho servera: názov, text, mená úloh, hráč a body. Žiadne admin údaje. Prázdna výprava alebo rebríček sú prázdne polia, nie chyba. Prehliadač z `https://filiper.eu` a `https://www.filiper.eu` môže čítať túto adresu.

## Overenie a migrácie

```bash
npm test
npm run lint
npm run build
npm audit --omit=dev
```

Neon migrácie sa aplikujú v poradí podľa čísla. Migrácia
`008_production_operations.sql` pridáva zdieľané limity, stav synchronizácie a
žiadosť o údaje. Pred migráciou over restore point; portál migrácie nespúšťa
automaticky.

Verejný `GET /api/health` vracia iba stav aplikácie. Podrobný stav databázy,
schémy, aktívnej výpravy a pluginu vyžaduje `Authorization: Bearer
$HEALTH_SECRET`. Monitoring, cleanup, incidenty a rollback opisuje
`../docs/public-launch-runbook.md`.
