import type { PoolClient } from "pg";
import { dbQuery, publicDbError, withTx } from "@/lib/db";
import { bratislavaSql } from "@/lib/dates";
import { goalSentence, generateExpedition, materialLabel, slugify } from "@/lib/matrices";
import { isServerId } from "@/lib/portal";
import { ensureServerKeyColumn } from "@/lib/server-key";

const KINDS = new Set(["kampan", "denne", "tyzdenne", "dlhodobe", "spolocne", "party"]);
const TRACKING = new Set([
  "break_block",
  "place_block",
  "pickup",
  "craft",
  "smelt",
  "kill",
  "join",
  "enter_world",
]);

export type AdminExpeditionCard = {
  id: string;
  serverId: string;
  title: string;
  description: string;
  status: "draft" | "active" | "ended";
  startsAt: string | null;
  endsAt: string | null;
  quests: number;
};

export type AdminServerCard = {
  id: string;
  label: string;
  hasKey: boolean;
  expeditions: AdminExpeditionCard[];
};

export type AdminQuestCard = {
  id: string;
  kind: string;
  title: string;
  description: string;
  points: number;
  targetCount: number;
  tracking: string;
  filters: string[];
  minChapter: number;
  rewards: { material: string; amount: number }[];
  chapterOrder: number | null;
  chapterTitle: string | null;
  chapterDescription: string | null;
  milestoneName: string | null;
  milestonePoints: number | null;
  goalLabel: string;
};

export type AdminDesk = {
  id: string;
  serverId: string;
  serverLabel: string;
  title: string;
  description: string;
  status: "draft" | "active" | "ended";
  startsAt: string | null;
  endsAt: string | null;
  quests: AdminQuestCard[];
  servers: { id: string; label: string }[];
  allowNewServer: boolean;
};

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asRewards(value: unknown): { material: string; amount: number }[] {
  if (!Array.isArray(value)) return [];
  const rewards: { material: string; amount: number }[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const row = item as { material?: unknown; amount?: unknown };
    const material = String(row.material ?? "").trim();
    const amount = Number(row.amount ?? 0);
    if (!material || !Number.isFinite(amount)) continue;
    rewards.push({ material, amount });
  }
  return rewards;
}

function statusOf(value: string): AdminExpeditionCard["status"] {
  if (value === "active" || value === "ended" || value === "draft") return value;
  return "draft";
}

export async function listAdminOverview(): Promise<AdminServerCard[]> {
  await ensureServerKeyColumn();
  const rows = await dbQuery<{
    server_id: string;
    label: string;
    has_key: boolean;
    expedition_id: string | null;
    title: string | null;
    description: string | null;
    status: string | null;
    starts_at: string | null;
    ends_at: string | null;
    quests: number | null;
  }>(
    `select s.id as server_id, s.label, (s.key_hash is not null) as has_key,
            e.id::text as expedition_id, e.title, e.description, e.status::text as status,
            e.starts_at, e.ends_at,
            (select count(*)::int from quest_definitions q where q.expedition_id = e.id) as quests
     from servers s
     left join expeditions e on e.server_id = s.id
     order by s.label, s.id, e.starts_at desc nulls last, e.created_at desc`,
  );
  const servers = new Map<string, AdminServerCard>();
  for (const row of rows) {
    let server = servers.get(row.server_id);
    if (!server) {
      server = { id: row.server_id, label: row.label, hasKey: Boolean(row.has_key), expeditions: [] };
      servers.set(row.server_id, server);
    }
    if (!row.expedition_id || !row.status || !row.title) continue;
    server.expeditions.push({
      id: row.expedition_id,
      serverId: row.server_id,
      title: row.title,
      description: row.description ?? "",
      status: statusOf(row.status),
      startsAt: iso(row.starts_at),
      endsAt: iso(row.ends_at),
      quests: Number(row.quests ?? 0),
    });
  }
  return [...servers.values()];
}

export async function loadDesk(expeditionId: string): Promise<AdminDesk | null> {
  if (!/^[0-9a-f-]{36}$/i.test(expeditionId)) return null;
  const rows = await dbQuery<{
    id: string;
    server_id: string;
    label: string;
    title: string;
    description: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
  }>(
    `select e.id::text, e.server_id, s.label, e.title, e.description, e.status::text as status,
            e.starts_at, e.ends_at
     from expeditions e
     join servers s on s.id = e.server_id
     where e.id = $1`,
    [expeditionId],
  );
  const expedition = rows[0];
  if (!expedition) return null;
  const quests = await dbQuery<{
    id: string;
    kind: string;
    title: string;
    description: string;
    points: number;
    target_count: number;
    tracking_type: string;
    filter_values: string[] | null;
    min_chapter: number;
    rewards: unknown;
    chapter_order: number | null;
    chapter_title: string | null;
    chapter_description: string | null;
    milestone_name: string | null;
    milestone_points: number | null;
  }>(
    `select id::text, kind::text as kind, title, description, points, target_count,
            tracking_type::text as tracking_type, filter_values, min_chapter, rewards,
            chapter_order, chapter_title, chapter_description, milestone_name, milestone_points
     from quest_definitions
     where expedition_id = $1
     order by kind, sort_order, title`,
    [expeditionId],
  );
  const servers = await dbQuery<{ id: string; label: string }>(
    "select id, label from servers order by label, id",
  );
  return {
    id: expedition.id,
    serverId: expedition.server_id,
    serverLabel: expedition.label,
    title: expedition.title,
    description: expedition.description,
    status: statusOf(expedition.status),
    startsAt: iso(expedition.starts_at),
    endsAt: iso(expedition.ends_at),
    servers,
    allowNewServer: false,
    quests: quests.map((quest) => {
      const filters = quest.filter_values ?? [];
      return {
        id: quest.id,
        kind: quest.kind,
        title: quest.title,
        description: quest.description,
        points: quest.points,
        targetCount: quest.target_count,
        tracking: quest.tracking_type,
        filters,
        minChapter: quest.min_chapter,
        rewards: asRewards(quest.rewards),
        chapterOrder: quest.chapter_order,
        chapterTitle: quest.chapter_title,
        chapterDescription: quest.chapter_description,
        milestoneName: quest.milestone_name,
        milestonePoints: quest.milestone_points,
        goalLabel: goalSentence(quest.tracking_type, quest.target_count, filters),
      };
    }),
  };
}

async function ensureServer(client: PoolClient, serverId: string) {
  if (!isServerId(serverId)) {
    throw new Error("Názov servera môže obsahovať písmená, čísla, pomlčku a podčiarkovník.");
  }
  await client.query(
    `insert into servers (id, label, first_seen_at)
     values ($1, $1, now())
     on conflict (id) do nothing`,
    [serverId],
  );
}

async function uniqueSlug(client: PoolClient, serverId: string, title: string): Promise<string> {
  const base = slugify(title);
  for (let n = 0; n < 6; n += 1) {
    const slug = n === 0 ? base : `${base}-${Math.random().toString(36).slice(2, 6)}`;
    const found = await client.query(
      "select 1 from expeditions where server_id = $1 and slug = $2",
      [serverId, slug],
    );
    if (found.rowCount === 0) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

function stableKey(kind: string): string {
  const prefix: Record<string, string> = {
    kampan: "c",
    denne: "d",
    tyzdenne: "w",
    dlhodobe: "l",
    spolocne: "s",
    party: "p",
  };
  return `${prefix[kind] ?? "q"}_${Math.random().toString(36).slice(2, 8)}`;
}

type QuestInput = {
  kind: string;
  title: string;
  description: string;
  points: number;
  targetCount: number;
  tracking: string;
  filters: string[];
  minChapter: number;
  rewards: { material: string; amount: number }[];
  sortOrder: number;
  chapterKey: string | null;
  chapterOrder: number | null;
  chapterTitle: string | null;
  chapterDescription: string | null;
  milestoneName: string | null;
  milestonePoints: number | null;
  milestoneRewards: { material: string; amount: number }[] | null;
};

async function insertQuest(client: PoolClient, expeditionId: string, quest: QuestInput, key: string) {
  await client.query(
    `insert into quest_definitions (
       expedition_id, stable_key, kind, title, description, points, target_count,
       tracking_type, filter_values, sort_order, active, min_chapter, rewards,
       chapter_key, chapter_order, chapter_title, chapter_description,
       milestone_name, milestone_points, milestone_rewards
     ) values (
       $1, $2, $3::quest_kind, $4, $5, $6, $7,
       $8::quest_tracking, $9::text[], $10, true, $11, $12::jsonb,
       $13, $14, $15, $16, $17, $18, $19::jsonb
     )`,
    [
      expeditionId,
      key,
      quest.kind,
      quest.title,
      quest.description,
      quest.points,
      quest.targetCount,
      quest.tracking,
      quest.filters,
      quest.sortOrder,
      quest.minChapter,
      JSON.stringify(quest.rewards),
      quest.chapterKey,
      quest.chapterOrder,
      quest.chapterTitle,
      quest.chapterDescription,
      quest.milestoneName,
      quest.milestonePoints,
      quest.milestoneRewards ? JSON.stringify(quest.milestoneRewards) : null,
    ],
  );
}

export async function createGeneratedDraft(serverId: string): Promise<string> {
  const generated = generateExpedition();
  return withTx(async (client) => {
    await ensureServer(client, serverId);
    const slug = await uniqueSlug(client, serverId, generated.title);
    const inserted = await client.query<{ id: string }>(
      `insert into expeditions (slug, title, description, status, starts_at, ends_at, server_id)
       values (
         $1, $2, $3, 'draft',
         (date_trunc('month', now() at time zone 'Europe/Bratislava') + interval '1 month')
           at time zone 'Europe/Bratislava',
         (date_trunc('month', now() at time zone 'Europe/Bratislava') + interval '2 month')
           at time zone 'Europe/Bratislava',
         $4
       )
       returning id::text`,
      [slug, generated.title, generated.description, serverId],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Výpravu sa nepodarilo založiť.");
    for (const quest of generated.quests) {
      await insertQuest(client, id, quest, stableKey(quest.kind));
    }
    return id;
  });
}

export async function copyExpedition(
  sourceId: string,
  serverId: string,
  title: string,
): Promise<{ id: string; note: string }> {
  const cleanTitle = title.trim().slice(0, 120);
  if (!cleanTitle) throw new Error("Nová výprava potrebuje názov.");
  return withTx(async (client) => {
    const source = await client.query<{ starts_at: Date | null; ends_at: Date | null }>(
      "select starts_at, ends_at from expeditions where id = $1",
      [sourceId],
    );
    if (!source.rowCount) throw new Error("Pôvodná výprava sa nenašla.");
    await ensureServer(client, serverId);
    const slug = await uniqueSlug(client, serverId, cleanTitle);
    const now = Date.now();
    const starts = source.rows[0]?.starts_at ? new Date(source.rows[0].starts_at).getTime() : null;
    const ends = source.rows[0]?.ends_at ? new Date(source.rows[0].ends_at).getTime() : null;
    const futureOnly = starts !== null && starts > now && (ends === null || ends > now);
    const inserted = await client.query<{ id: string }>(
      `insert into expeditions (slug, title, description, status, starts_at, ends_at, server_id)
       select $2, $3, description, 'draft',
              case when $4 then starts_at else null end,
              case when $4 then ends_at else null end,
              $5
       from expeditions
       where id = $1
       returning id::text`,
      [sourceId, slug, cleanTitle, futureOnly, serverId],
    );
    const id = inserted.rows[0]?.id;
    if (!id) throw new Error("Kópiu sa nepodarilo založiť.");
    await client.query(
      `insert into quest_definitions (
         expedition_id, stable_key, kind, title, description, points, target_count,
         tracking_type, filter_values, sort_order, active, min_chapter, rewards,
         chapter_key, chapter_order, chapter_title, chapter_description,
         milestone_name, milestone_points, milestone_rewards
       )
       select $2, stable_key, kind, title, description, points, target_count,
              tracking_type, filter_values, sort_order, active, min_chapter, rewards,
              chapter_key, chapter_order, chapter_title, chapter_description,
              milestone_name, milestone_points, milestone_rewards
       from quest_definitions
       where expedition_id = $1`,
      [sourceId, id],
    );
    return {
      id,
      note: futureOnly
        ? "Kópia je návrh a drží budúce dátumy."
        : "Kópia je návrh bez dátumov, aby sa hneď nezapla.",
    };
  });
}

export async function expeditionAccess(id: string): Promise<{ serverId: string; status: string } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await dbQuery<{ server_id: string; status: string }>(
    "select server_id, status::text as status from expeditions where id = $1",
    [id],
  );
  const row = rows[0];
  if (!row) return null;
  return { serverId: row.server_id, status: row.status };
}

export async function saveExpeditionMeta(input: {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
}) {
  const title = input.title.trim().slice(0, 120);
  if (!title) throw new Error("Výprava potrebuje názov.");
  const starts = bratislavaSql(input.startsAt);
  const ends = bratislavaSql(input.endsAt);
  if (input.startsAt.trim() && !starts) throw new Error("Dátum od nie je platný.");
  if (input.endsAt.trim() && !ends) throw new Error("Dátum do nie je platný.");
  const updated = await dbQuery<{ id: string }>(
    `update expeditions
     set title = $2,
         description = $3,
         starts_at = case when $4::text is null then null else $4::timestamp at time zone 'Europe/Bratislava' end,
         ends_at = case when $5::text is null then null else $5::timestamp at time zone 'Europe/Bratislava' end
     where id = $1 and status = 'draft'
     returning id::text as id`,
    [input.id, title, input.description.trim().slice(0, 600), starts, ends],
  );
  if (updated.length !== 1) {
    throw new Error("Táto výprava už nie je návrh.");
  }
}

export async function startExpedition(id: string) {
  await withTx(async (client) => {
    const rows = await client.query<{
      status: string;
      server_id: string;
      starts_at: Date | null;
      ends_at: Date | null;
    }>(
      `select status::text as status, server_id, starts_at, ends_at
       from expeditions where id = $1 for update`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new Error("Výprava sa nenašla.");
    if (row.status !== "draft") throw new Error("Spustiť sa dá len návrh.");
    if (!row.starts_at) throw new Error("Najprv nastav dátum od.");
    const now = Date.now();
    if (new Date(row.starts_at).getTime() > now) {
      throw new Error("Dátum od je ešte v budúcnosti. Posuň ho, alebo počkaj.");
    }
    if (row.ends_at && new Date(row.ends_at).getTime() <= now) {
      throw new Error("Dátum do už prešiel. Predĺž termín.");
    }
    await client.query("select pg_advisory_xact_lock(48271001, hashtext($1))", [row.server_id]);
    await client.query("select activate_expedition($1::uuid)", [id]);
  });
}

export async function endExpedition(id: string) {
  const updated = await withTx(async (client) => {
    const rows = await client.query<{ server_id: string }>(
      `select server_id from expeditions where id = $1 and status = 'active' for update`,
      [id],
    );
    const row = rows.rows[0];
    if (!row) throw new Error("Ukončiť sa dá len aktívna výprava.");
    await client.query("select pg_advisory_xact_lock(48271001, hashtext($1))", [row.server_id]);
    const result = await client.query(
      `update expeditions
       set status = 'ended',
           ends_at = case when ends_at is null or ends_at > now() then now() else ends_at end
       where id = $1 and status = 'active'`,
      [id],
    );
    return result.rowCount ?? 0;
  });
  if (!updated) throw new Error("Výpravu sa nepodarilo ukončiť.");
}

const TOKEN = /^[A-Z0-9_]{1,64}$/;

function cleanTokens(values: string[]): string[] {
  const unique = [...new Set(values.map((value) => value.trim().toUpperCase()).filter(Boolean))];
  if (unique.length > 24) throw new Error("Cieľov je priveľa.");
  for (const value of unique) {
    if (!TOKEN.test(value)) throw new Error("Cieľ obsahuje nepovolený znak.");
  }
  return unique;
}

function cleanRewards(values: { material: string; amount: number }[]) {
  return values
    .map((reward) => ({
      material: reward.material.trim().toUpperCase(),
      amount: Math.round(Number(reward.amount)),
    }))
    .filter((reward) => reward.material && reward.amount > 0)
    .slice(0, 6)
    .map((reward) => {
      if (!TOKEN.test(reward.material) || reward.amount > 999) {
        throw new Error("Odmena nie je v poriadku.");
      }
      return reward;
    });
}

export function parseQuestForm(form: FormData) {
  const kind = String(form.get("kind") ?? "");
  const tracking = String(form.get("tracking") ?? "");
  const title = String(form.get("title") ?? "").trim().slice(0, 120);
  const description = String(form.get("description") ?? "").trim().slice(0, 600);
  const points = Math.round(Number(form.get("points") ?? 0));
  const targetCount = Math.round(Number(form.get("targetCount") ?? 1));
  const minChapter = Math.round(Number(form.get("minChapter") ?? 1));
  const filters = cleanTokens(form.getAll("filters").map(String));
  const rewardMaterials = form.getAll("rewardMaterial").map(String);
  const rewardAmounts = form.getAll("rewardAmount").map(String);
  const rewards = cleanRewards(
    rewardMaterials.map((material, index) => ({
      material,
      amount: Number(rewardAmounts[index] ?? 0),
    })),
  );
  if (!KINDS.has(kind)) throw new Error("Neznámy druh úlohy.");
  if (!TRACKING.has(tracking)) throw new Error("Vyber, čo sa má počítať.");
  if (!title) throw new Error("Úloha potrebuje názov.");
  if (!Number.isFinite(points) || points < 0 || points > 10000) throw new Error("Body nie sú v poriadku.");
  if (!Number.isFinite(targetCount) || targetCount < 1 || targetCount > 100000) {
    throw new Error("Počet musí byť aspoň 1.");
  }
  if (!Number.isFinite(minChapter) || minChapter < 1 || minChapter > 99) {
    throw new Error("Minimálna kapitola nie je v poriadku.");
  }
  if (tracking !== "join" && filters.length === 0) throw new Error("Vyber aspoň jeden cieľ.");

  const chapterTitle = String(form.get("chapterTitle") ?? "").trim().slice(0, 120);
  const chapterDescription = String(form.get("chapterDescription") ?? "").trim().slice(0, 400);
  const chapterOrderRaw = String(form.get("chapterOrder") ?? "").trim();
  const chapterOrder = chapterOrderRaw ? Math.round(Number(chapterOrderRaw)) : null;
  const milestoneName = String(form.get("milestoneName") ?? "").trim().slice(0, 120);
  const milestonePointsRaw = String(form.get("milestonePoints") ?? "").trim();
  const milestonePoints = milestonePointsRaw ? Math.round(Number(milestonePointsRaw)) : null;

  let chapterKey: string | null = null;
  if (kind === "kampan") {
    if (!chapterTitle) throw new Error("Kampaňová úloha potrebuje názov kapitoly.");
    if (!chapterOrder || chapterOrder < 1 || chapterOrder > 99) {
      throw new Error("Poradie kapitoly nie je v poriadku.");
    }
    chapterKey = `chapter_${chapterOrder}`;
  }

  return {
    kind,
    title,
    description: description || goalSentence(tracking, targetCount, filters),
    points,
    targetCount,
    tracking,
    filters: tracking === "join" ? [] : filters,
    minChapter,
    rewards,
    chapterKey,
    chapterOrder: kind === "kampan" ? chapterOrder : null,
    chapterTitle: kind === "kampan" ? chapterTitle : null,
    chapterDescription: kind === "kampan" ? chapterDescription : null,
    milestoneName: kind === "kampan" ? milestoneName || null : null,
    milestonePoints: kind === "kampan" ? milestonePoints : null,
  };
}

export async function saveQuest(expeditionId: string, questId: string | null, form: FormData) {
  const parsed = parseQuestForm(form);
  await withTx(async (client) => {
    const found = await client.query<{ status: string }>(
      "select status::text as status from expeditions where id = $1 for update",
      [expeditionId],
    );
    if (!found.rowCount) throw new Error("Výprava sa nenašla.");
    if (found.rows[0]?.status !== "draft") throw new Error("Táto výprava už nie je návrh.");
    if (questId) {
      const updated = await client.query(
        `update quest_definitions
         set kind = $3::quest_kind,
             title = $4,
             description = $5,
             points = $6,
             target_count = $7,
             tracking_type = $8::quest_tracking,
             filter_values = $9::text[],
             min_chapter = $10,
             rewards = $11::jsonb,
             chapter_key = $12,
             chapter_order = $13,
             chapter_title = $14,
             chapter_description = $15,
             milestone_name = $16,
             milestone_points = $17
         where expedition_id = $1 and id = $2`,
        [
          expeditionId,
          questId,
          parsed.kind,
          parsed.title,
          parsed.description,
          parsed.points,
          parsed.targetCount,
          parsed.tracking,
          parsed.filters,
          parsed.minChapter,
          JSON.stringify(parsed.rewards),
          parsed.chapterKey,
          parsed.chapterOrder,
          parsed.chapterTitle,
          parsed.chapterDescription,
          parsed.milestoneName,
          parsed.milestonePoints,
        ],
      );
      if (!updated.rowCount) throw new Error("Úloha sa nenašla.");
      return;
    }
    const order = await client.query<{ next: number }>(
      `select coalesce(max(sort_order), -1) + 1 as next
       from quest_definitions
       where expedition_id = $1 and kind = $2::quest_kind`,
      [expeditionId, parsed.kind],
    );
    await insertQuest(
      client,
      expeditionId,
      {
        ...parsed,
        sortOrder: Number(order.rows[0]?.next ?? 0),
        milestoneRewards: null,
      },
      stableKey(parsed.kind),
    );
  });
}

export async function removeQuest(expeditionId: string, questId: string) {
  const removed = await dbQuery(
    `delete from quest_definitions q
     where q.expedition_id = $1 and q.id = $2
       and exists (
         select 1 from expeditions e
         where e.id = q.expedition_id and e.status = 'draft'
       )
     returning q.id`,
    [expeditionId, questId],
  );
  if (!removed.length) throw new Error("Úloha sa nenašla.");
}

export function goalPreview(tracking: string, count: number, filters: string[]): string {
  return goalSentence(tracking, count, filters.map((id) => id));
}

export { materialLabel, publicDbError };
