import { dbQuery, hasDatabase, withTx } from "@/lib/db";
import type { GoogleSession } from "@/lib/google-auth";
import { readSession, googleConfigured } from "@/lib/google-auth";
import { isServerId } from "@/lib/portal";

export type PortalRole = "hrac" | "spravca";

export type PortalAccount = {
  googleSub: string;
  email: string;
  displayName: string;
  role: PortalRole;
  allServers: boolean;
  serverIds: string[];
};

export type AdminView =
  | { kind: "google-off" }
  | { kind: "signed-out" }
  | { kind: "no-database" }
  | { kind: "bootstrap"; account: PortalAccount }
  | { kind: "denied" }
  | { kind: "ready"; account: PortalAccount; others: PortalAccount[] };

type Row = {
  google_sub: string;
  email: string;
  display_name: string;
  role: string;
  all_servers: boolean;
  server_ids: string[] | null;
};

let ready: Promise<void> | null = null;

export function ensurePortalSchema(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      await dbQuery("select language from players limit 0");
      await dbQuery(
        `select google_sub, email, display_name, role, all_servers, server_ids
         from portal_accounts limit 0`,
      );
    })().catch((error: unknown) => {
      ready = null;
      throw error;
    });
  }
  return ready;
}

export function allowsServer(account: PortalAccount, serverId: string): boolean {
  if (account.role !== "spravca") return false;
  if (account.allServers) return true;
  return account.serverIds.includes(serverId);
}

export async function rememberSignedIn(session: GoogleSession): Promise<PortalAccount> {
  await ensurePortalSchema();
  const email = session.email.trim().slice(0, 200);
  const name = (session.name || session.email || "Google").trim().slice(0, 80);
  const rows = await dbQuery<Row>(
    `insert into portal_accounts (google_sub, email, display_name, role, all_servers, server_ids)
     values ($1, $2, $3, 'hrac', false, '{}')
     on conflict (google_sub) do update set
       email = excluded.email,
       display_name = excluded.display_name,
       updated_at = now()
     returning google_sub, email, display_name, role, all_servers, server_ids`,
    [session.sub, email, name],
  );
  const row = rows[0];
  if (!row) throw new Error("Účet sa nepodarilo uložiť.");
  return mapAccount(row);
}

export async function loadAdminView(): Promise<AdminView> {
  if (!googleConfigured()) return { kind: "google-off" };
  const session = await readSession();
  if (!session) return { kind: "signed-out" };
  if (!hasDatabase()) return { kind: "no-database" };
  const account = await rememberSignedIn(session);
  const spravcaCount = await countSpravca();
  if (spravcaCount === 0) return { kind: "bootstrap", account };
  if (account.role !== "spravca") return { kind: "denied" };
  const others = account.allServers ? (await listAccounts()).filter((item) => item.googleSub !== account.googleSub) : [];
  return { kind: "ready", account, others };
}

export async function requireSpravca(): Promise<PortalAccount | null> {
  const view = await loadAdminView();
  if (view.kind !== "ready") return null;
  return view.account;
}

export async function bootstrapSpravca(session: GoogleSession): Promise<void> {
  await ensurePortalSchema();
  const email = session.email.trim().slice(0, 200);
  const name = (session.name || session.email || "Google").trim().slice(0, 80);
  await withTx(async (client) => {
    await client.query("select pg_advisory_xact_lock(48271002)");
    const count = await client.query<{ n: number }>("select count(*)::int as n from portal_accounts where role = 'spravca'");
    if (Number(count.rows[0]?.n ?? 0) > 0) {
      throw new Error("Správca už existuje.");
    }
    await client.query(
      `insert into portal_accounts (google_sub, email, display_name, role, all_servers, server_ids)
       values ($1, $2, $3, 'spravca', true, '{}')
       on conflict (google_sub) do update set
         email = excluded.email,
         display_name = excluded.display_name,
         role = 'spravca',
         all_servers = true,
         server_ids = '{}',
         updated_at = now()`,
      [session.sub, email, name],
    );
  });
}

export async function setAccountRole(input: {
  actorSub: string;
  targetSub: string;
  role: PortalRole;
  allServers: boolean;
  serverIds: string[];
}): Promise<void> {
  if (input.actorSub === input.targetSub) {
    throw new Error("Svoj účet tu nemeníš.");
  }
  await withTx(async (client) => {
    await client.query("select pg_advisory_xact_lock(48271002)");
    const actor = await client.query<Row>(
      "select google_sub, email, display_name, role, all_servers, server_ids from portal_accounts where google_sub = $1",
      [input.actorSub],
    );
    const actorRow = actor.rows[0];
    if (!actorRow || actorRow.role !== "spravca" || !actorRow.all_servers) {
      throw new Error("Roly mení len správca všetkých serverov.");
    }
    const target = await client.query<{ google_sub: string }>(
      "select google_sub from portal_accounts where google_sub = $1",
      [input.targetSub],
    );
    if ((target.rowCount ?? 0) !== 1) {
      throw new Error("Tento Google účet sa ešte neprihlásil.");
    }
    const role = input.role;
    const allServers = role === "spravca" && input.allServers;
    const serverIds = role === "spravca" && !allServers ? input.serverIds : [];
    if (role === "spravca" && !allServers && serverIds.length === 0) {
      throw new Error("Správca potrebuje všetky servery alebo aspoň jeden server.");
    }
    for (const serverId of serverIds) {
      if (!isServerId(serverId)) throw new Error("Názov servera nie je v poriadku.");
    }
    const remaining = await client.query<{ n: number }>(
      `select count(*)::int as n from portal_accounts
       where role = 'spravca' and all_servers and google_sub <> $1`,
      [input.targetSub],
    );
    const keepsAll = role === "spravca" && allServers;
    if (!keepsAll && Number(remaining.rows[0]?.n ?? 0) === 0 && actorRow.google_sub !== input.targetSub) {
      const actorStill = actorRow.all_servers && actorRow.role === "spravca" && actorRow.google_sub !== input.targetSub;
      if (!actorStill) throw new Error("Posledný správca všetkých serverov musí ostať.");
    }
    if (!keepsAll) {
      const others = Number(remaining.rows[0]?.n ?? 0);
      if (others === 0) throw new Error("Posledný správca všetkých serverov musí ostať.");
    }
    await client.query(
      `update portal_accounts
       set role = $2, all_servers = $3, server_ids = $4::text[], updated_at = now()
       where google_sub = $1`,
      [input.targetSub, role, allServers, serverIds],
    );
  });
}

async function countSpravca(): Promise<number> {
  const rows = await dbQuery<{ n: number }>("select count(*)::int as n from portal_accounts where role = 'spravca'");
  return Number(rows[0]?.n ?? 0);
}

async function listAccounts(): Promise<PortalAccount[]> {
  const rows = await dbQuery<Row>(
    `select google_sub, email, display_name, role, all_servers, server_ids
     from portal_accounts
     order by display_name, email`,
  );
  return rows.map(mapAccount);
}

function mapAccount(row: Row): PortalAccount {
  const role: PortalRole = row.role === "spravca" ? "spravca" : "hrac";
  const serverIds = (row.server_ids ?? []).filter((id) => isServerId(id));
  return {
    googleSub: row.google_sub,
    email: row.email ?? "",
    displayName: row.display_name ?? "",
    role,
    allServers: role === "spravca" && Boolean(row.all_servers),
    serverIds: role === "spravca" && !row.all_servers ? serverIds : [],
  };
}
