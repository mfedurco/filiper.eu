import { withTx } from "@/lib/db";

export type CleanupResult = {
  expiredClaims: number;
  rateBuckets: number;
  privacyRequests: number;
};

export async function runCleanup(): Promise<CleanupResult> {
  return withTx(async (client) => {
    const claims = await client.query(
      `with expired as (
         select id from players
         where claim_expires_at <= now()
         order by claim_expires_at
         limit 1000
         for update skip locked
       )
       update players p
       set claim_code_hash = null, claim_expires_at = null
       from expired e
       where p.id = e.id`,
    );
    const buckets = await client.query(
      `delete from security_rate_limits
       where ctid in (
         select ctid from security_rate_limits
         where expires_at <= now()
         order by expires_at
         limit 5000
       )`,
    );
    const privacy = await client.query(
      `delete from privacy_requests
       where id in (
         select id from privacy_requests
         where resolved_at < now() - interval '365 days'
         order by resolved_at
         limit 1000
       )`,
    );
    return {
      expiredClaims: claims.rowCount ?? 0,
      rateBuckets: buckets.rowCount ?? 0,
      privacyRequests: privacy.rowCount ?? 0,
    };
  });
}
