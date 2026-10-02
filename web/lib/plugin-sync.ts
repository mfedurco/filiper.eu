import type { PoolClient } from "pg";
import { withTx } from "@/lib/db";
import { isServerId } from "@/lib/portal";
import { ensureServerKeyColumn, serverKeyMatches } from "@/lib/server-key";

const GOAL_KINDS = new Set(["daily", "weekly", "long_term", "shared", "campaign", "party"]);

export type PluginLoad = {
  expedition: {
    id: string;
    slug: string;
    title: string;
    description: string;
    status: string;
    startsAt: string | null;
    endsAt: string | null;
  } | null;
  quests: PluginQuest[];
};

type PluginQuest = {
  stableKey: string;
  kind: string;
  title: string;
  description: string;
  points: number;
  targetCount: number;
  trackingType: string;
  filterValues: string[];
  sortOrder: number;
  active: boolean;
  minChapter: number;
  rewardsJson: string;
  chapterKey: string | null;
  chapterOrder: number | null;
  chapterTitle: string | null;
  chapterDescription: string | null;
  milestoneName: string | null;
  milestonePoints: number;
  milestoneRewardsJson: string;
};

type GoalMeta = {
  goalKind: string;
  name: string;
  description: string;
  objectiveType: string;
  targets: string[];
  amount: number;
  points: number;
  minChapter: number;
  chapterId: string | null;
  chapterOrder: number | null;
  rewardsJson: string;
};

export class PluginRejected extends Error {
  constructor() {
    super("rejected");
  }
}

export class PluginPayload extends Error {
  constructor() {
    super("payload");
  }
}

export async function authorizePlugin(serverId: string, rawKey: string | null): Promise<void> {
  await ensureServerKeyColumn();
  if (!isServerId(serverId) || !rawKey) {
    throw new PluginRejected();
  }
  const ok = await serverKeyMatches(serverId, rawKey);
  if (!ok) throw new PluginRejected();
}

export async function loadForPlugin(serverId: string): Promise<PluginLoad> {
  return withTx(async (client) => {
    await client.query("select apply_expedition_schedule($1, $2)", [new Date().toISOString(), serverId]);
    const active = await client.query<{
      id: string;
      slug: string;
      title: string;
      description: string;
      status: string;
      starts_at: Date | null;
      ends_at: Date | null;
    }>(
      `select id::text as id, slug, title, coalesce(description, '') as description,
              status::text as status, starts_at, ends_at
       from expeditions
       where status = 'active' and server_id = $1
       limit 1`,
      [serverId],
    );
    const expedition = active.rows[0];
    if (!expedition) return { expedition: null, quests: [] };
    const quests = await client.query<{
      stable_key: string;
      kind: string;
      title: string;
      description: string;
      points: number;
      target_count: number;
      tracking_type: string;
      filter_values: string[] | null;
      sort_order: number;
      active: boolean;
      min_chapter: number;
      rewards: string | null;
      chapter_key: string | null;
      chapter_order: number | null;
      chapter_title: string | null;
      chapter_description: string | null;
      milestone_name: string | null;
      milestone_points: number | null;
      milestone_rewards: string | null;
    }>(
      `select stable_key, kind::text as kind, title, coalesce(description, '') as description,
              points, target_count, tracking_type::text as tracking_type, filter_values,
              sort_order, active, min_chapter, rewards::text as rewards,
              chapter_key, chapter_order, chapter_title, chapter_description,
              milestone_name, milestone_points, milestone_rewards::text as milestone_rewards
       from quest_definitions
       where expedition_id = $1 and server_id = $2 and active
       order by sort_order, stable_key`,
      [expedition.id, serverId],
    );
    return {
      expedition: {
        id: expedition.id,
        slug: expedition.slug,
        title: expedition.title,
        description: expedition.description,
        status: expedition.status,
        startsAt: expedition.starts_at ? expedition.starts_at.toISOString() : null,
        endsAt: expedition.ends_at ? expedition.ends_at.toISOString() : null,
      },
      quests: quests.rows.map((row) => ({
        stableKey: row.stable_key,
        kind: row.kind,
        title: row.title,
        description: row.description,
        points: row.points,
        targetCount: row.target_count,
        trackingType: row.tracking_type,
        filterValues: row.filter_values ?? [],
        sortOrder: row.sort_order,
        active: row.active,
        minChapter: row.min_chapter,
        rewardsJson: row.rewards ?? "[]",
        chapterKey: row.chapter_key,
        chapterOrder: row.chapter_order,
        chapterTitle: row.chapter_title,
        chapterDescription: row.chapter_description,
        milestoneName: row.milestone_name,
        milestonePoints: row.milestone_points ?? 0,
        milestoneRewardsJson: row.milestone_rewards ?? "[]",
      })),
    };
  });
}

export async function pushForPlugin(serverId: string, body: unknown): Promise<void> {
  const record = asRecord(body);
  const players = asArray(record.players).slice(0, 2000);
  const shared = asArray(record.shared).slice(0, 2000);
  const parties = asArray(record.parties).slice(0, 2000);
  const goals = asRecord(record.goals);
  await withTx(async (client) => {
    for (const item of players) {
      const row = asRecord(item);
      const expeditionId = String(row.expeditionId ?? "");
      await requireOwned(client, serverId, expeditionId);
      await pushPlayer(client, serverId, expeditionId, asRecord(row.snapshot), goals);
    }
    for (const item of shared) {
      const row = asRecord(item);
      const expeditionId = String(row.expeditionId ?? "");
      await requireOwned(client, serverId, expeditionId);
      await pushShared(client, serverId, expeditionId, asRecord(row.snapshot), goals);
    }
    for (const item of parties) {
      const row = asRecord(item);
      const expeditionId = String(row.expeditionId ?? "");
      await requireOwned(client, serverId, expeditionId);
      await pushParty(client, serverId, expeditionId, asRecord(row.snapshot), goals);
    }
  });
}

async function requireOwned(client: PoolClient, serverId: string, expeditionId: string): Promise<void> {
  if (!/^[0-9a-f-]{36}$/i.test(expeditionId)) throw new PluginPayload();
  const found = await client.query("select 1 from expeditions where id = $1 and server_id = $2", [
    expeditionId,
    serverId,
  ]);
  if ((found.rowCount ?? 0) !== 1) throw new PluginPayload();
}

async function pushPlayer(
  client: PoolClient,
  serverId: string,
  expeditionId: string,
  snapshot: Record<string, unknown>,
  goals: Record<string, unknown>,
): Promise<void> {
  const mcUuid = String(snapshot.uuid ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(mcUuid)) throw new PluginPayload();
  const player = await client.query<{ id: string }>(
    `insert into players (mc_uuid, name, chapter, total_points, weekly_points, party_id, server_id, updated_at)
     values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (server_id, mc_uuid) do update set
       name = excluded.name,
       chapter = excluded.chapter,
       total_points = excluded.total_points,
       weekly_points = excluded.weekly_points,
       party_id = excluded.party_id,
       updated_at = now()
     returning id::text as id`,
    [
      mcUuid,
      clip(String(snapshot.name ?? "Unknown"), 64),
      Math.max(1, integer(snapshot.chapter, 1)),
      integer(snapshot.totalPoints, 0),
      integer(snapshot.weeklyPoints, 0),
      blankToNull(snapshot.partyId),
      serverId,
    ],
  );
  const playerId = player.rows[0]?.id;
  if (!playerId) throw new PluginPayload();
  await client.query(
    `insert into leaderboard_snapshot (
       player_id, expedition_id, server_id, name, total_points, weekly_points, chapter, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, now())
     on conflict (server_id, expedition_id, player_id) where expedition_id is not null
     do update set
       name = excluded.name,
       total_points = excluded.total_points,
       weekly_points = excluded.weekly_points,
       chapter = excluded.chapter,
       updated_at = now()`,
    [
      playerId,
      expeditionId,
      serverId,
      clip(String(snapshot.name ?? "Unknown"), 64),
      integer(snapshot.totalPoints, 0),
      integer(snapshot.weeklyPoints, 0),
      Math.max(1, integer(snapshot.chapter, 1)),
    ],
  );
  await client.query(
    "delete from player_progress where player_id = $1 and expedition_id = $2 and server_id = $3",
    [playerId, expeditionId, serverId],
  );
  const quests = asRecord(snapshot.quests);
  const keys = Object.keys(quests).slice(0, 400);
  for (const key of keys) {
    const row = asRecord(quests[key]);
    const kind = String(row.goalKind ?? "campaign");
    await ensureGoal(client, key, kind, goalOf(goals, key));
    await client.query(
      `insert into player_progress (
         player_id, goal_id, expedition_id, server_id, current_amount, completed, updated_at
       ) values ($1, $2, $3, $4, $5, $6, now())`,
      [playerId, key, expeditionId, serverId, integer(row.current, 0), bool(row.completed)],
    );
  }
}

async function pushShared(
  client: PoolClient,
  serverId: string,
  expeditionId: string,
  snapshot: Record<string, unknown>,
  goals: Record<string, unknown>,
): Promise<void> {
  const questKey = String(snapshot.questKey ?? "");
  if (!questKey) throw new PluginPayload();
  await ensureGoal(client, questKey, "shared", goalOf(goals, questKey));
  await client.query(
    `insert into shared_goal_state (
       goal_id, expedition_id, server_id, progress, completed, period_key, updated_at
     ) values ($1, $2, $3, $4, $5, $6, now())
     on conflict (server_id, expedition_id, goal_id) where expedition_id is not null
     do update set
       progress = excluded.progress,
       completed = excluded.completed,
       period_key = excluded.period_key,
       updated_at = now()`,
    [
      questKey,
      expeditionId,
      serverId,
      integer(snapshot.progress, 0),
      bool(snapshot.completed),
      blankToNull(snapshot.periodKey),
    ],
  );
  await client.query(
    "delete from contributions where goal_id = $1 and expedition_id = $2 and server_id = $3",
    [questKey, expeditionId, serverId],
  );
  await insertContributions(client, serverId, expeditionId, questKey, asRecord(snapshot.contributions));
}

async function pushParty(
  client: PoolClient,
  serverId: string,
  expeditionId: string,
  snapshot: Record<string, unknown>,
  goals: Record<string, unknown>,
): Promise<void> {
  const partyKey = String(snapshot.partyId ?? "");
  if (!partyKey) throw new PluginPayload();
  const questKey = blankToNull(snapshot.questKey);
  const leader = blankToNull(snapshot.leader);
  await client.query(
    `insert into parties (
       server_id, expedition_id, party_key, name, leader_mc_uuid,
       quest_key, quest_progress, quest_completed, updated_at
     ) values ($1, $2, $3, $4, $5, $6, $7, $8, now())
     on conflict (server_id, expedition_id, party_key) where expedition_id is not null
     do update set
       name = excluded.name,
       leader_mc_uuid = excluded.leader_mc_uuid,
       quest_key = excluded.quest_key,
       quest_progress = excluded.quest_progress,
       quest_completed = excluded.quest_completed,
       updated_at = now()`,
    [
      serverId,
      expeditionId,
      clip(partyKey, 64),
      clip(String(snapshot.name ?? ""), 64),
      leader && /^[0-9a-f-]{36}$/i.test(leader) ? leader : null,
      questKey,
      integer(snapshot.progress, 0),
      bool(snapshot.completed),
    ],
  );
  if (!questKey) return;
  await ensureGoal(client, questKey, "party", goalOf(goals, questKey));
  const contributions = asRecord(snapshot.contributions);
  for (const [mcUuid, amount] of Object.entries(contributions).slice(0, 200)) {
    if (!/^[0-9a-f-]{36}$/i.test(mcUuid)) continue;
    const found = await client.query<{ id: string }>(
      "select id::text as id from players where server_id = $1 and mc_uuid = $2",
      [serverId, mcUuid],
    );
    const playerId = found.rows[0]?.id;
    if (!playerId) continue;
    await client.query(
      `insert into contributions (goal_id, player_id, expedition_id, server_id, amount, updated_at)
       values ($1, $2, $3, $4, $5, now())
       on conflict (server_id, expedition_id, goal_id, player_id) where expedition_id is not null
       do update set amount = excluded.amount, updated_at = now()`,
      [questKey, playerId, expeditionId, serverId, integer(amount, 0)],
    );
  }
}

async function insertContributions(
  client: PoolClient,
  serverId: string,
  expeditionId: string,
  goalId: string,
  contributions: Record<string, unknown>,
): Promise<void> {
  for (const [mcUuid, amount] of Object.entries(contributions).slice(0, 200)) {
    if (!/^[0-9a-f-]{36}$/i.test(mcUuid)) continue;
    const found = await client.query<{ id: string }>(
      "select id::text as id from players where server_id = $1 and mc_uuid = $2",
      [serverId, mcUuid],
    );
    const playerId = found.rows[0]?.id;
    if (!playerId) continue;
    await client.query(
      `insert into contributions (goal_id, player_id, expedition_id, server_id, amount, updated_at)
       values ($1, $2, $3, $4, $5, now())`,
      [goalId, playerId, expeditionId, serverId, integer(amount, 0)],
    );
  }
}

async function ensureGoal(
  client: PoolClient,
  goalId: string,
  fallbackKind: string,
  meta: GoalMeta | null,
): Promise<void> {
  if (meta && GOAL_KINDS.has(meta.goalKind)) {
    await client.query(
      `insert into goals (
         id, kind, name, description, objective_type, targets, amount, points,
         min_chapter, chapter_id, chapter_order, rewards, active
       ) values (
         $1, $2::goal_kind, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, true
       )
       on conflict (id) do nothing`,
      [
        goalId,
        meta.goalKind,
        clip(meta.name, 200),
        clip(meta.description, 2000),
        clip(meta.objectiveType || "BREAK_BLOCK", 64),
        meta.targets.slice(0, 32),
        meta.amount,
        meta.points,
        meta.minChapter,
        meta.chapterId,
        meta.chapterOrder,
        jsonText(meta.rewardsJson),
      ],
    );
    return;
  }
  const kind = GOAL_KINDS.has(fallbackKind) ? fallbackKind : "campaign";
  await client.query(
    `insert into goals (id, kind, name, objective_type, amount, active)
     values ($1, $2::goal_kind, $3, 'BREAK_BLOCK', 1, true)
     on conflict (id) do nothing`,
    [goalId, kind, clip(goalId, 200)],
  );
}

function goalOf(goals: Record<string, unknown>, key: string): GoalMeta | null {
  const raw = goals[key];
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const targets = Array.isArray(row.targets) ? row.targets.map((item) => String(item)) : [];
  return {
    goalKind: String(row.goalKind ?? ""),
    name: String(row.name ?? key),
    description: String(row.description ?? ""),
    objectiveType: String(row.objectiveType ?? "BREAK_BLOCK"),
    targets,
    amount: integer(row.amount, 1),
    points: integer(row.points, 0),
    minChapter: integer(row.minChapter, 1),
    chapterId: blankToNull(row.chapterId),
    chapterOrder: row.chapterOrder == null || row.chapterOrder === "" ? null : integer(row.chapterOrder, 0),
    rewardsJson: String(row.rewardsJson ?? "[]"),
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function integer(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.trunc(number);
}

function bool(value: unknown): boolean {
  return value === true || value === "true";
}

function blankToNull(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function clip(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max);
}

function jsonText(value: string): string {
  try {
    JSON.parse(value);
    return value;
  } catch {
    return "[]";
  }
}
