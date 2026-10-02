import { cache } from "react";
import { headers } from "next/headers";
import { dbQuery, hasDatabase } from "@/lib/db";
import type {
  Campaign,
  Chapter,
  Contribution,
  LeaderboardEntry,
  PlayerProgress,
  Quest,
  QuestPool,
  RewardItem,
  SharedGoal,
} from "@/lib/types";

export const DEFAULT_SERVER = "test";

const TRACKING_TO_TYPE: Record<string, string> = {
  break_block: "BREAK_BLOCK",
  place_block: "PLACE_BLOCK",
  pickup: "PICKUP_ITEM",
  craft: "CRAFT_ITEM",
  smelt: "SMELT_ITEM",
  kill: "KILL_ENTITY",
  join: "JOIN",
  enter_world: "ENTER_WORLD",
};

export type ServerOption = { id: string; label: string };

export type ExpeditionMeta = {
  id: string;
  slug: string;
  title: string;
  description: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
};

export type PortalMeta = {
  connected: boolean;
  failed: boolean;
  serverId: string;
  servers: ServerOption[];
  expedition: ExpeditionMeta | null;
};

type QuestRow = {
  stable_key: string;
  kind: string;
  title: string;
  description: string;
  points: number;
  target_count: number;
  tracking_type: string;
  filter_values: string[] | null;
  sort_order: number;
  min_chapter: number;
  rewards: unknown;
  chapter_key: string | null;
  chapter_order: number | null;
  chapter_title: string | null;
  chapter_description: string | null;
  milestone_name: string | null;
  milestone_points: number | null;
  milestone_rewards: unknown;
};

type PlayerRow = {
  id: string;
  name: string;
  mc_uuid: string | null;
  chapter: number;
  total_points: number;
  weekly_points: number;
  party_id: string | null;
};

type ProgressRow = {
  player_id: string;
  goal_id: string;
  current_amount: number;
  completed: boolean;
};

export type PortalBundle = PortalMeta & {
  campaign: Campaign;
  daily: QuestPool;
  weekly: QuestPool;
  longterm: QuestPool;
  party: QuestPool;
  shared: SharedGoal[];
  leaderboard: LeaderboardEntry[];
  players: PlayerProgress[];
};

const EMPTY_CAMPAIGN: Campaign = { title: "Výprava", chapters: [] };

function asRewards(value: unknown): RewardItem[] {
  if (!Array.isArray(value)) return [];
  const rewards: RewardItem[] = [];
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

function goalKind(kind: string): Quest["kind"] {
  switch (kind) {
    case "denne":
      return "daily";
    case "tyzdenne":
      return "weekly";
    case "dlhodobe":
      return "long_term";
    case "spolocne":
      return "shared";
    case "party":
      return "party";
    default:
      return "campaign";
  }
}

function toQuest(row: QuestRow): Quest {
  return {
    id: row.stable_key,
    name: row.title,
    description: row.description ?? "",
    type: TRACKING_TO_TYPE[row.tracking_type] ?? row.tracking_type,
    targets: row.filter_values ?? [],
    amount: Number(row.target_count ?? 1),
    points: Number(row.points ?? 0),
    minChapter: Number(row.min_chapter ?? 1),
    rewards: asRewards(row.rewards),
    kind: goalKind(row.kind),
  };
}

function iso(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function isServerId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value);
}

export async function currentServerId(): Promise<string> {
  const headerStore = await headers();
  const raw = headerStore.get("x-vyprava-server")?.trim() ?? "";
  return isServerId(raw) ? raw : DEFAULT_SERVER;
}

function emptyMeta(serverId: string, failed = false): PortalMeta {
  return {
    connected: hasDatabase(),
    failed,
    serverId,
    servers: [],
    expedition: null,
  };
}

export const getPortalMeta = cache(async (): Promise<PortalMeta> => {
  const serverId = await currentServerId();
  if (!hasDatabase()) return emptyMeta(serverId, false);
  try {
    const servers = await dbQuery<ServerOption>(
      "select id, label from servers order by label, id",
    );
    await dbQuery(
      "select changed from apply_expedition_schedule(now(), $1)",
      [serverId],
    );
    const rows = await dbQuery<{
      id: string;
      slug: string;
      title: string;
      description: string;
      status: string;
      starts_at: string | null;
      ends_at: string | null;
    }>(
      `select id::text, slug, title, description, status::text as status, starts_at, ends_at
       from expeditions
       where server_id = $1 and status = 'active'
       limit 1`,
      [serverId],
    );
    const row = rows[0];
    return {
      connected: true,
      failed: false,
      serverId,
      servers,
      expedition: row
        ? {
            id: row.id,
            slug: row.slug,
            title: row.title,
            description: row.description,
            status: row.status,
            startsAt: iso(row.starts_at),
            endsAt: iso(row.ends_at),
          }
        : null,
    };
  } catch (error) {
    console.error("portal meta", error instanceof Error ? error.message : "error");
    return emptyMeta(serverId, true);
  }
});

function poolFrom(rows: QuestRow[], kind: string): QuestPool {
  return {
    pool: rows.filter((row) => row.kind === kind).map(toQuest),
  };
}

function campaignFrom(rows: QuestRow[], title: string): Campaign {
  const chapters = new Map<string, Chapter>();
  for (const row of rows.filter((item) => item.kind === "kampan")) {
    const key = row.chapter_key || `chapter_${row.chapter_order ?? 1}`;
    let chapter = chapters.get(key);
    if (!chapter) {
      chapter = {
        id: key,
        order: Number(row.chapter_order ?? chapters.size + 1),
        name: row.chapter_title || "Kapitola",
        description: row.chapter_description || "",
        quests: [],
        milestone: {
          name: row.milestone_name || "Milník",
          points: Number(row.milestone_points ?? 0),
          rewards: asRewards(row.milestone_rewards),
        },
      };
      chapters.set(key, chapter);
    }
    chapter.quests.push(toQuest(row));
  }
  return {
    title,
    chapters: [...chapters.values()].sort((a, b) => a.order - b.order),
  };
}

function buildPlayer(
  player: PlayerRow,
  quests: QuestRow[],
  progress: ProgressRow[],
  party: { name: string; quest_key: string | null; quest_progress: number; quest_completed: boolean } | null,
): PlayerProgress {
  const byKey = new Map(quests.map((quest) => [quest.stable_key, quest]));
  const mine = progress.filter((row) => row.player_id === player.id);
  const questProgress: PlayerProgress["questProgress"] = {};
  const completed = new Set<string>();
  for (const row of mine) {
    const quest = byKey.get(row.goal_id);
    questProgress[row.goal_id] = {
      current: row.current_amount,
      target: quest?.target_count ?? row.current_amount,
    };
    if (row.completed) completed.add(row.goal_id);
  }

  const slice = (kind: string) =>
    mine
      .map((row) => {
        const quest = byKey.get(row.goal_id);
        if (!quest || quest.kind !== kind) return null;
        return {
          id: quest.stable_key,
          name: quest.title,
          current: row.current_amount,
          target: quest.target_count,
          completed: row.completed,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

  const campaign = campaignFrom(quests, "");
  const chapter =
    campaign.chapters.find((item) => item.order === player.chapter) ?? campaign.chapters[0];
  const completedMilestones = campaign.chapters
    .filter((item) => item.quests.length > 0 && item.quests.every((quest) => completed.has(quest.id)))
    .map((item) => item.id);

  let partyQuest: PlayerProgress["partyQuest"] = null;
  if (party?.quest_key) {
    const quest = byKey.get(party.quest_key);
    if (quest) {
      partyQuest = {
        id: quest.stable_key,
        name: quest.title,
        current: party.quest_progress,
        target: quest.target_count,
        completed: party.quest_completed,
        partyName: party.name || "Partia",
      };
    }
  }

  return {
    playerName: player.name,
    uuid: player.mc_uuid ?? "",
    currentChapter: player.chapter,
    chapterName: chapter?.name ?? `Kapitola ${player.chapter}`,
    totalPoints: player.total_points,
    weeklyPoints: player.weekly_points,
    completedQuests: [...completed],
    questProgress,
    completedMilestones,
    dailyQuests: slice("denne"),
    weeklyQuests: slice("tyzdenne"),
    longTermQuests: slice("dlhodobe"),
    partyQuest,
  };
}

export const getPortalBundle = cache(async (): Promise<PortalBundle> => {
  const meta = await getPortalMeta();
  const blank: PortalBundle = {
    ...meta,
    campaign: EMPTY_CAMPAIGN,
    daily: { pool: [] },
    weekly: { pool: [] },
    longterm: { pool: [] },
    party: { pool: [] },
    shared: [],
    leaderboard: [],
    players: [],
  };
  if (!meta.connected || meta.failed) return blank;

  try {
    const players = await dbQuery<PlayerRow>(
      `select id::text, name, mc_uuid, chapter, total_points, weekly_points, party_id
       from players
       where server_id = $1
       order by total_points desc, name`,
      [meta.serverId],
    );

    if (!meta.expedition) {
      return {
        ...blank,
        leaderboard: players.map((player) => ({
          name: player.name,
          totalPoints: player.total_points,
          weeklyPoints: player.weekly_points,
          chapter: player.chapter,
        })),
        players: players.map((player) =>
          buildPlayer(player, [], [], null),
        ),
      };
    }

    const expeditionId = meta.expedition.id;
    const [quests, progress, sharedState, contributions, board, parties] = await Promise.all([
      dbQuery<QuestRow>(
        `select stable_key, kind::text as kind, title, description, points, target_count,
                tracking_type::text as tracking_type, filter_values, sort_order, min_chapter,
                rewards, chapter_key, chapter_order, chapter_title, chapter_description,
                milestone_name, milestone_points, milestone_rewards
         from quest_definitions
         where expedition_id = $1 and server_id = $2 and active
         order by sort_order, title`,
        [expeditionId, meta.serverId],
      ),
      dbQuery<ProgressRow>(
        `select player_id::text, goal_id, current_amount, completed
         from player_progress
         where server_id = $1 and expedition_id = $2`,
        [meta.serverId, expeditionId],
      ),
      dbQuery<{ goal_id: string; progress: number; completed: boolean }>(
        `select goal_id, progress, completed
         from shared_goal_state
         where server_id = $1 and expedition_id = $2`,
        [meta.serverId, expeditionId],
      ),
      dbQuery<{ goal_id: string; amount: number; name: string }>(
        `select c.goal_id, c.amount, p.name
         from contributions c
         join players p on p.id = c.player_id
         where c.server_id = $1 and c.expedition_id = $2
         order by c.amount desc`,
        [meta.serverId, expeditionId],
      ),
      dbQuery<LeaderboardEntry & { total_points: number; weekly_points: number }>(
        `select name, total_points, weekly_points, chapter
         from leaderboard_snapshot
         where server_id = $1 and expedition_id = $2
         order by total_points desc, name
         limit 50`,
        [meta.serverId, expeditionId],
      ),
      dbQuery<{
        party_key: string;
        name: string;
        quest_key: string | null;
        quest_progress: number;
        quest_completed: boolean;
      }>(
        `select party_key, name, quest_key, quest_progress, quest_completed
         from parties
         where server_id = $1 and expedition_id = $2`,
        [meta.serverId, expeditionId],
      ),
    ]);

    const contribByGoal = new Map<string, Contribution[]>();
    for (const row of contributions) {
      const list = contribByGoal.get(row.goal_id) ?? [];
      list.push({ name: row.name, amount: row.amount });
      contribByGoal.set(row.goal_id, list);
    }
    const stateByGoal = new Map(sharedState.map((row) => [row.goal_id, row]));
    const shared: SharedGoal[] = quests
      .filter((row) => row.kind === "spolocne")
      .map((row) => {
        const state = stateByGoal.get(row.stable_key);
        return {
          ...toQuest(row),
          progress: state?.progress ?? 0,
          completed: state?.completed ?? false,
          contributions: contribByGoal.get(row.stable_key) ?? [],
        };
      });

    const snapshotByName = new Map(board.map((row) => [row.name, row]));
    const leaderboard: LeaderboardEntry[] = (players.length ? players : []).map((player) => {
      const snap = snapshotByName.get(player.name);
      return {
        name: player.name,
        totalPoints: Math.max(player.total_points, snap?.total_points ?? 0),
        weeklyPoints: Math.max(player.weekly_points, snap?.weekly_points ?? 0),
        chapter: Math.max(player.chapter, snap?.chapter ?? 1),
      };
    });
    if (!leaderboard.length && board.length) {
      for (const row of board) {
        leaderboard.push({
          name: row.name,
          totalPoints: row.total_points,
          weeklyPoints: row.weekly_points,
          chapter: row.chapter,
        });
      }
    }

    return {
      ...meta,
      campaign: campaignFrom(quests, meta.expedition.title),
      daily: poolFrom(quests, "denne"),
      weekly: poolFrom(quests, "tyzdenne"),
      longterm: poolFrom(quests, "dlhodobe"),
      party: poolFrom(quests, "party"),
      shared,
      leaderboard,
      players: players.map((player) =>
        buildPlayer(
          player,
          quests,
          progress,
          parties.find((item) => item.party_key === player.party_id) ?? null,
        ),
      ),
    };
  } catch (error) {
    console.error("portal bundle", error instanceof Error ? error.message : "error");
    return { ...blank, failed: true, connected: true };
  }
});
