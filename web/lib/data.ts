import { promises as fs } from "fs";
import path from "path";
import { createServerSupabase, createServiceSupabase, hasSupabaseEnv } from "./supabase";
import type {
  AdminSettings,
  Campaign,
  Chapter,
  Contribution,
  LeaderboardEntry,
  PlayerProgress,
  Quest,
  QuestPool,
  RewardItem,
  SharedGoal,
} from "./types";

const DATA_DIR = path.join(process.cwd(), "data");
const QUESTS_DIR = path.join(DATA_DIR, "quests");

async function readJsonFile<T>(filePath: string): Promise<T> {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

async function tryReadJson<T>(...candidates: string[]): Promise<T> {
  let lastError: unknown;
  for (const candidate of candidates) {
    try {
      return await readJsonFile<T>(candidate);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("Nepodarilo sa načítať dáta.");
}

function mapGoalRow(row: Record<string, unknown>): Quest {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    type: String(row.objective_type ?? "BREAK_BLOCK"),
    targets: Array.isArray(row.targets) ? (row.targets as string[]) : [],
    amount: Number(row.amount ?? 1),
    points: Number(row.points ?? 0),
    minChapter: Number(row.min_chapter ?? 1),
    rewards: (row.rewards as RewardItem[]) ?? [],
    kind: row.kind as Quest["kind"],
    periodKey: (row.period_key as string) ?? null,
  };
}

export async function getCampaign(): Promise<Campaign> {
  if (hasSupabaseEnv()) {
    const sb = createServerSupabase();
    if (sb) {
      const { data: goals } = await sb
        .from("goals")
        .select("*")
        .eq("kind", "campaign")
        .order("chapter_order");
      const { data: milestones } = await sb
        .from("milestones")
        .select("*")
        .order("chapter_order");
      if (goals?.length && milestones?.length) {
        const byChapter = new Map<string, Chapter>();
        for (const m of milestones) {
          byChapter.set(m.chapter_id, {
            id: m.chapter_id,
            order: m.chapter_order,
            name: m.chapter_name,
            description: m.description ?? "",
            quests: [],
            milestone: {
              name: m.name,
              points: m.points,
              rewards: (m.rewards as RewardItem[]) ?? [],
            },
          });
        }
        for (const g of goals) {
          const chapter = byChapter.get(g.chapter_id);
          if (chapter) chapter.quests.push(mapGoalRow(g));
        }
        return {
          title: "Cesta Preživších",
          chapters: [...byChapter.values()].sort((a, b) => a.order - b.order),
        };
      }
    }
  }
  return tryReadJson<Campaign>(
    path.join(QUESTS_DIR, "campaign.json"),
    path.join(DATA_DIR, "campaign.json"),
  );
}

async function getPoolByKind(
  kind: string,
  localFiles: string[],
): Promise<QuestPool> {
  if (hasSupabaseEnv()) {
    const sb = createServerSupabase();
    if (sb) {
      const { data } = await sb
        .from("goals")
        .select("*")
        .eq("kind", kind)
        .eq("active", true)
        .order("min_chapter");
      if (data?.length) {
        return {
          pool: data.map(mapGoalRow),
          periodKey: (data[0].period_key as string) || undefined,
        };
      }
    }
  }
  return tryReadJson<QuestPool>(...localFiles.map((f) => path.join(f)));
}

export async function getDailyPool(): Promise<QuestPool> {
  return getPoolByKind("daily", [
    path.join(QUESTS_DIR, "daily.json"),
    path.join(DATA_DIR, "daily.json"),
  ]);
}

export async function getWeeklyPool(): Promise<QuestPool> {
  try {
    return await getPoolByKind("weekly", [
      path.join(QUESTS_DIR, "weekly.json"),
      path.join(DATA_DIR, "weekly.json"),
    ]);
  } catch {
    return {
      periodKey: "2026-W40",
      pool: [
        {
          id: "w_wood",
          name: "Týždeň drevorubača",
          description: "Získaj 200 klád počas týždňa.",
          type: "BREAK_BLOCK",
          targets: ["OAK_LOG", "BIRCH_LOG", "SPRUCE_LOG"],
          amount: 200,
          points: 40,
          minChapter: 1,
          rewards: [{ material: "IRON_INGOT", amount: 12 }],
        },
        {
          id: "w_iron",
          name: "Železný týždeň",
          description: "Vyťaž 64 železnej rudy.",
          type: "BREAK_BLOCK",
          targets: ["IRON_ORE", "DEEPSLATE_IRON_ORE"],
          amount: 64,
          points: 55,
          minChapter: 3,
          rewards: [{ material: "IRON_BLOCK", amount: 2 }],
        },
        {
          id: "w_mobs",
          name: "Hliadka týždňa",
          description: "Zabi 60 nepriateľských mobov.",
          type: "KILL_ENTITY",
          targets: ["ZOMBIE", "SKELETON", "CREEPER"],
          amount: 60,
          points: 55,
          minChapter: 4,
          rewards: [{ material: "GOLDEN_APPLE", amount: 2 }],
        },
      ],
    };
  }
}

export async function getLongTermPool(): Promise<QuestPool> {
  try {
    return await getPoolByKind("long_term", [
      path.join(QUESTS_DIR, "longterm.json"),
      path.join(DATA_DIR, "longterm.json"),
    ]);
  } catch {
    return {
      periodKey: "2026-S4",
      pool: [
        {
          id: "l_explorer",
          name: "Prieskumník sezóny",
          description: "Polož 1000 stavebných blokov počas sezóny.",
          type: "PLACE_BLOCK",
          targets: ["ANY_SOLID"],
          amount: 1000,
          points: 150,
          minChapter: 1,
          rewards: [{ material: "DIAMOND", amount: 4 }],
        },
        {
          id: "l_miner",
          name: "Baník sezóny",
          description: "Vyťaž 400 železnej rudy.",
          type: "BREAK_BLOCK",
          targets: ["IRON_ORE", "DEEPSLATE_IRON_ORE"],
          amount: 400,
          points: 180,
          minChapter: 3,
          rewards: [{ material: "IRON_BLOCK", amount: 8 }],
        },
        {
          id: "l_hunter",
          name: "Lovec sezóny",
          description: "Zabi 250 nepriateľských mobov.",
          type: "KILL_ENTITY",
          targets: ["ZOMBIE", "SKELETON", "CREEPER", "SPIDER"],
          amount: 250,
          points: 180,
          minChapter: 4,
          rewards: [{ material: "ENCHANTED_GOLDEN_APPLE", amount: 1 }],
        },
      ],
    };
  }
}

export async function getPartyPool(): Promise<QuestPool> {
  return getPoolByKind("party", [
    path.join(QUESTS_DIR, "party.json"),
    path.join(DATA_DIR, "party.json"),
  ]);
}

export async function getSharedGoals(): Promise<SharedGoal[]> {
  if (hasSupabaseEnv()) {
    const sb = createServerSupabase();
    if (sb) {
      const { data: goals } = await sb
        .from("goals")
        .select("*")
        .eq("kind", "shared")
        .eq("active", true);
      const { data: states } = await sb.from("shared_goal_state").select("*");
      const { data: contrib } = await sb
        .from("contributions")
        .select("goal_id, amount, players(name, mc_uuid)");
      if (goals?.length) {
        const stateMap = new Map((states ?? []).map((s) => [s.goal_id, s]));
        const contribMap = new Map<string, Contribution[]>();
        for (const c of contrib ?? []) {
          const list = contribMap.get(c.goal_id) ?? [];
          const player = c.players as { name?: string; mc_uuid?: string } | null;
          list.push({
            name: player?.name ?? "Unknown",
            amount: c.amount,
            uuid: player?.mc_uuid,
          });
          contribMap.set(c.goal_id, list);
        }
        return goals.map((g) => {
          const st = stateMap.get(g.id);
          return {
            ...mapGoalRow(g),
            progress: st?.progress ?? 0,
            completed: st?.completed ?? false,
            periodKey: st?.period_key ?? g.period_key,
            contributions: (contribMap.get(g.id) ?? []).sort(
              (a, b) => b.amount - a.amount,
            ),
          };
        });
      }
    }
  }

  try {
    return await readJsonFile<SharedGoal[]>(path.join(DATA_DIR, "shared.json"));
  } catch {
    return [
      {
        id: "s_bridge",
        name: "Postavte spoločne most",
        description: "Spoločne položte 800 blokov – postavte most cez údolie.",
        type: "PLACE_BLOCK",
        targets: ["ANY_SOLID"],
        amount: 800,
        points: 60,
        progress: 512,
        completed: false,
        periodKey: "2026-W40",
        rewards: [{ material: "EMERALD", amount: 8 }],
        contributions: [
          { name: "ZuzkaBuilder", amount: 180 },
          { name: "MajoCraft", amount: 140 },
          { name: "EmaExplorer", amount: 100 },
          { name: "PeterPickaxe", amount: 92 },
        ],
      },
      {
        id: "s_iron",
        name: "Spoločne vyťažte železo",
        description: "Spoločne vyťažte 500 železnej rudy.",
        type: "BREAK_BLOCK",
        targets: ["IRON_ORE", "DEEPSLATE_IRON_ORE"],
        amount: 500,
        points: 70,
        progress: 210,
        completed: false,
        periodKey: "2026-W40",
        rewards: [{ material: "IRON_BLOCK", amount: 4 }],
        contributions: [
          { name: "TomasMine", amount: 95 },
          { name: "MajoCraft", amount: 70 },
          { name: "NinaNether", amount: 45 },
        ],
      },
    ];
  }
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  if (hasSupabaseEnv()) {
    const sb = createServerSupabase();
    if (sb) {
      const { data } = await sb
        .from("leaderboard_snapshot")
        .select("*")
        .order("total_points", { ascending: false })
        .limit(50);
      if (data?.length) {
        return data.map((row) => ({
          name: row.name,
          totalPoints: row.total_points,
          weeklyPoints: row.weekly_points,
          chapter: row.chapter,
        }));
      }
    }
  }
  return tryReadJson<LeaderboardEntry[]>(path.join(DATA_DIR, "leaderboard.json"));
}

export async function getProgressDemo(): Promise<PlayerProgress> {
  return tryReadJson<PlayerProgress>(path.join(DATA_DIR, "progress-demo.json"));
}

export async function getAdminSettings(): Promise<AdminSettings> {
  if (hasSupabaseEnv()) {
    const sb = createServerSupabase();
    if (sb) {
      const { data } = await sb.from("admin_settings").select("*").eq("id", 1).maybeSingle();
      if (data) {
        return {
          rewardsEnabled: data.rewards_enabled,
          pointsEnabled: data.points_enabled,
          minChapterEnforced: data.min_chapter_enforced,
        };
      }
    }
  }
  try {
    return await readJsonFile<AdminSettings>(path.join(QUESTS_DIR, "settings.json"));
  } catch {
    return {
      rewardsEnabled: true,
      pointsEnabled: true,
      minChapterEnforced: true,
    };
  }
}

export async function writeQuestData(
  kind: "campaign" | "daily" | "weekly" | "longterm" | "party" | "shared" | "settings",
  data: unknown,
): Promise<void> {
  const service = createServiceSupabase();
  if (service && kind === "settings") {
    const s = data as AdminSettings;
    await service.from("admin_settings").upsert({
      id: 1,
      rewards_enabled: s.rewardsEnabled,
      points_enabled: s.pointsEnabled,
      min_chapter_enforced: s.minChapterEnforced,
      updated_at: new Date().toISOString(),
    });
  }

  await fs.mkdir(QUESTS_DIR, { recursive: true });
  const file = path.join(QUESTS_DIR, `${kind}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
  if (kind !== "settings") {
    await fs.writeFile(
      path.join(DATA_DIR, `${kind}.json`),
      JSON.stringify(data, null, 2) + "\n",
      "utf8",
    );
  }
}

export function getAdminPassword(): string {
  return process.env.VYPRVA_ADMIN_PASSWORD?.trim() || "vyprava";
}

export function supabaseConfigured(): boolean {
  return hasSupabaseEnv();
}
