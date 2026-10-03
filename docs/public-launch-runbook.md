# Výprava public-launch runbook

## Required configuration

Vercel Root Directory remains `web`. Configure `DATABASE_URL`, `APP_ORIGIN`,
`ADMIN_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, plus:

- `RATE_LIMIT_SECRET`: at least 32 random bytes, shared by every deployment
  instance. Rotation resets all rate-limit identities.
- `HEALTH_SECRET`: separate random value (at least 32 bytes) for detailed health.
- `CRON_SECRET`: separate random value used by Vercel Cron.
- `PLUGIN_SYNC_STALE_MINUTES`: optional integer; default is 5.

Apply `web/neon/008_production_operations.sql` manually after a restore point.
Do not run migrations from Vercel requests.

## External edge controls (not configured)

No Cloudflare, Vercel, or Neon management session was authenticated during this
work. The rules and alerts below are recommendations only; existing account
rules and plan entitlements remain unknown. `vyprava.filiper.eu` is currently
proxied by Cloudflare in front of Vercel.

In Cloudflare select `filiper.eu` → **Security** → **Security rules** →
**Create rule** → **Rate limiting rules**. Count by IP, return 429/block, and
place these before broader rules:

| Route expression | Threshold | Mitigation |
| --- | ---: | ---: |
| `http.host eq "vyprava.filiper.eu" and http.request.method eq "GET" and http.request.uri.path eq "/api/auth/google"` | 20 / 60 s / IP | 60 s |
| `http.host eq "vyprava.filiper.eu" and http.request.method eq "GET" and http.request.uri.path eq "/api/auth/google/callback"` | 30 / 60 s / IP | 60 s |
| `http.host eq "vyprava.filiper.eu" and http.request.method eq "POST" and (starts_with(http.request.uri.path, "/hrac/") or starts_with(http.request.uri.path, "/admin"))` | 30 / 60 s / IP | 60 s |
| `http.host eq "vyprava.filiper.eu" and http.request.method eq "POST" and http.request.uri.path eq "/api/plugin/sync"` | 120 / 60 s / IP | 10 s |
| `http.host eq "vyprava.filiper.eu" and http.request.method eq "GET" and (starts_with(http.request.uri.path, "/api/public/") or http.request.uri.path in {"/api/leaderboard" "/api/quests/campaign" "/api/quests/daily" "/api/quests/party"})` | 120 / 60 s / IP | 60 s |

The plugin allowance supports roughly 20 servers behind one NAT at one retry per
10 seconds. Increase it proportionally before adding more. Never put a browser
challenge on `/api/plugin/sync`.

Cloudflare currently documents 1 rate rule on Free, 2 on Pro, and 5 on
Business. On Pro, retain the plugin rule and combine all other listed paths at
60 / 60 s / IP with 60-second mitigation (method matching is unavailable). On
Free, use one zone rule for the same paths, including `/api/plugin/sync`, at
20 / 10 s / IP with 10-second mitigation, after confirming no path collision
on another hostname. If that is unsuitable, use Vercel **Project → Firewall →
Configure → New Rule**, keyed by IP, with the same thresholds; begin in **Log**
and review traffic before enforcing 429.

Deploy the available Cloudflare managed ruleset at defaults. Do not enable
ordinary Bot Fight Mode or standing Under Attack Mode. Super Bot Fight Mode is
safe only with an earlier custom Skip rule scoped to that product:

```text
http.host eq "vyprava.filiper.eu" and (http.request.uri.path eq "/api/plugin/sync" or starts_with(http.request.uri.path, "/api/auth/google") or starts_with(http.request.uri.path, "/hrac/") or starts_with(http.request.uri.path, "/admin"))
```

## Monitoring

Public uptime check:

```sh
curl --fail --silent https://vyprava.filiper.eu/api/health
# {"status":"up"}
```

Detailed readiness check (store the secret in the monitor, never in a URL):

```sh
curl --fail --silent \
  -H "Authorization: Bearer $HEALTH_SECRET" \
  https://vyprava.filiper.eu/api/health
```

The detailed response separately reports application, database, migration
schema, active expedition, and plugin liveness. `not_ready` returns HTTP 503.
Alert immediately for database/schema failures; investigate missing expedition
or stale/missing plugin sync before declaring gameplay available.

The Paper plugin sends a small authenticated heartbeat without player data,
starting about 5 seconds after enable and then every 60 seconds. Failed attempts
back off from 10 seconds to at most 5 minutes and use rate-limited warnings.
After installing/restarting a healthy plugin, readiness should normally change
from `pluginSync: missing` to `ok` within 10 seconds; allow up to 70 seconds
before investigating routing, server id, or server-key configuration.

Also alert on Vercel 5xx/latency, Neon connections/storage, repeated structured
`plugin.auth_denied`, `plugin.failure`, `oauth.failure`, and `database.failure`
events, and Paper outbox warnings. `X-Request-Id` correlates a response with a
privacy-safe JSON log entry.

The scheduled GitHub workflow checks only the public minimal endpoint and
security headers. It contains no monitoring secret and therefore does not prove
database readiness. Vercel invokes `/api/cron/cleanup` daily from `web/vercel.json`
using `CRON_SECRET`; the endpoint is idempotent and batch-bounded.

No external alerts were configured. If the plan permits, create Cloudflare
Health Checks in **Traffic/Smart Shield → Health Checks**:

- `vyprava-portal`: HTTPS host `vyprava.filiper.eu`, path `/`, GET, port 443,
  60-second interval, 5-second timeout, 2 retries, accept 200–399.
- `vyprava-public-api`: same host, path `/api/public/test`, GET, port 443,
  60-second interval, 5-second timeout, 2 retries, accept 200 only.

Subscribe Miroslav's owned destination to both status-change notifications.
In Vercel **Observability → Alerts**, when entitled, enable production **Error
Anomaly** and **Usage Anomaly → Duration/Function duration**, attach an owned
email/Slack destination, and test it. In Neon, configure connection saturation,
storage/compute limits, suspend/resume, and query-latency alerts if exposed.

If those entitlements are unavailable, configure an external monitor: every
60 seconds check `/` (200–399) and `/api/public/test` (200), each under 2,000 ms;
every 5 minutes assert `Content-Security-Policy`, `X-Frame-Options: DENY`,
`X-Content-Type-Options: nosniff`, `Referrer-Policy`, and
`Permissions-Policy`. Alert after 2 consecutive failures and resolve after 2
successes.

## Privacy request operations

Review pending requests without exporting values into logs:

```sql
select id, request_type, requested_at
from privacy_requests
where status = 'pending'
order by requested_at;
```

Verify identity and scope outside public comments. For `export`, prepare only
the requesting account's portal/profile/gameplay data and use an approved secure
delivery channel. For `unlink`, clear the matching player's `google_sub` and
profile text if requested, then invalidate the portal account/session by
removing or changing the account record. For `delete`, map shared gameplay
dependencies first; delete or anonymize only after approval. Mark the request
`completed` or `rejected` with `resolved_at = now()`. Never paste Google
identifiers, e-mail, UUIDs, names, claim codes, server keys, or database URLs in
logs or tickets.

Before launch, Miroslav must replace every clearly marked placeholder on
`/sukromie` and `/uchovavanie`, confirm guardian/lawful-basis requirements,
subprocessor terms/regions, and the operational retention settings.

## Incident response

1. Assign incident lead and use the private incident contact (must be filled in
   before launch).
2. Preserve timestamps and request IDs, not personal values or secrets.
3. Contain: disable affected route/deployment, rotate the relevant server,
   Google, admin, health, cron, or limiter secret, and revoke exposed credentials.
4. Assess affected data, children, duration, and notification obligations.
5. Recover from a known commit and verify detailed readiness plus a real plugin
   sync.
6. Record decisions and complete required controller/authority/user notices.

## Rollback and recovery

For portal-only regressions, promote the previous known-good Vercel deployment.
Database migration 008 is additive; leave its tables in place during application
rollback. Do not drop them during an incident. For plugin regressions, stop
Paper, restore the prior JAR/config/data backup, restart, and verify queued sync.

A current-state logical backup was successfully restored into an isolated
PostgreSQL 18.6 instance and cleaned up on 2026-10-03. That proves the logical
recovery path only. Neon-native point-in-time restore, retained-history window,
and temporary branch deletion remain unproven because no authenticated Neon
management session was available. Do not describe PITR as tested.

After rollback, verify:

- public `/api/health` and all security headers;
- protected readiness with the health secret;
- Google state replay rejection and one normal sign-in;
- plugin authentication, load, push, and fresh sync timestamp;
- an active expedition and expected public data;
- cleanup endpoint once with the cron secret.
