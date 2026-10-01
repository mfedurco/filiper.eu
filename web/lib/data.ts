import { promises as fs } from "fs";
import path from "path";
import { getSql, hasDatabaseEnv, type Sql } from "./db";
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

type Row = Record<string, unknown>;

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

function logDbFallback(error: unknown): void {
  const raw = error instanceof Error ? error.message : String(error);
  const message = raw.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgresql://[redacted]");
  console.error("[vyprava] Neon query failed; using demo JSON.", message);
}

const DB_READ_TIMEOUT_MS = 8000;

/** Run a read against Neon. Null means "use demo JSON" (unset, empty, error, or timeout). */
async function readDatabase<T>(run: (sql: Sql) => Promise<T | null>): Promise<T | null> {
  const sql = getSql();
  if (!sql) return null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const pending = run(sql);
  // If the timeout wins, a later query failure must not surface as unhandled.
  pending.catch(() => undefined);
  try {
    return await Promise.race([
      pending,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("Neon query timed out")),
          DB_READ_TIMEOUT_MS,
        );
      }),
    ]);
  } catch (error) {
    logDbFallback(error);
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function asRewards(value: unknown): RewardItem[] {
  if (Array.isArray(value)) return value as RewardItem[];
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? (parsed as RewardItem[]) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function asTargets(value: unknown): string[] {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.startsWith("{") && value.endsWith("}")) {
    const inner = value.slice(1, -1).trim();
    return inner ? inner.split(",").map((item) => item.trim()) : [];
  }
  return [];
}

function asBool(value: unknown, fallback = false): boolean {
  if (typeof value === "boolean") return value;
  if (value == null) return fallback;
  if (value === "true" || value === "t" || value === 1) return true;
  if (value === "false" || value === "f" || value === 0) return false;
  return fallback;
}

function mapGoalRow(row: Row): Quest {
  return {
    id: String(row.id),
    name: String(row.name),
    description: String(row.description ?? ""),
    type: String(row.objective_type ?? "BREAK_BLOCK"),
    targets: asTargets(row.targets),
    amount: Number(row.amount ?? 1),
    points: Number(row.points ?? 0),
    minChapter: Number(row.min_chapter ?? 1),
    rewards: asRewards(row.rewards),
    kind: row.kind as Quest["kind"],
    periodKey: (row.period_key as string) ?? null,
  };
}

export async function getCampaign(): Promise<Campaign> {
  const fromDb = await readDatabase(async (sql) => {
    const goals = (await sql`
      select *
      from goals
      where kind = 'campaign'
      order by chapter_order
    `) as Row[];
    const milestones = (await sql`
      select *
      from milestones
      order by chapter_order
    `) as Row[];
    if (!goals.length || !milestones.length) return null;

    const byChapter = new Map<string, Chapter>();
    for (const m of milestones) {
      const chapterId = String(m.chapter_id);
      byChapter.set(chapterId, {
        id: chapterId,
        order: Number(m.chapter_order),
        name: String(m.chapter_name),
        description: String(m.description ?? ""),
        quests: [],
        milestone: {
          name: String(m.name),
          points: Number(m.points ?? 0),
          rewards: asRewards(m.rewards),
        },
      });
    }
    for (const g of goals) {
      const chapter = byChapter.get(String(g.chapter_id ?? ""));
      if (chapter) chapter.quests.push(mapGoalRow(g));
    }
    return {
      title: "Cesta Preživších",
      chapters: [...byChapter.values()].sort((a, b) => a.order - b.order),
    };
  });
  if (fromDb) return fromDb;

  return tryReadJson<Campaign>(
    path.join(QUESTS_DIR, "campaign.json"),
    path.join(DATA_DIR, "campaign.json"),
  );
}

async function getPoolByKind(
  kind: string,
  localFiles: string[],
): Promise<QuestPool> {
  const fromDb = await readDatabase(async (sql) => {
    const data = (await sql`
      select *
      from goals
      where kind::text = ${kind}
        and active = true
      order by min_chapter
    `) as Row[];
    if (!data.length) return null;
    return {
      pool: data.map(mapGoalRow),
      periodKey: (data[0].period_key as string) || undefined,
    };
  });
  if (fromDb) return fromDb;

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
  const fromDb = await readDatabase(async (sql) => {
    const goals = (await sql`
      select *
      from goals
      where kind = 'shared'
        and active = true
    `) as Row[];
    if (!goals.length) return null;

    const states = (await sql`select * from shared_goal_state`) as Row[];
    const contrib = (await sql`
      select c.goal_id, c.amount, p.name as player_name, p.mc_uuid
      from contributions c
      left join players p on p.id = c.player_id
    `) as Row[];

    const stateMap = new Map(states.map((s) => [String(s.goal_id), s]));
    const contribMap = new Map<string, Contribution[]>();
    for (const c of contrib) {
      const goalId = String(c.goal_id);
      const list = contribMap.get(goalId) ?? [];
      list.push({
        name: c.player_name ? String(c.player_name) : "Unknown",
        amount: Number(c.amount ?? 0),
        uuid: c.mc_uuid ? String(c.mc_uuid) : undefined,
      });
      contribMap.set(goalId, list);
    }

    return goals.map((g) => {
      const st = stateMap.get(String(g.id));
      return {
        ...mapGoalRow(g),
        progress: Number(st?.progress ?? 0),
        completed: asBool(st?.completed, false),
        periodKey: (st?.period_key as string | null | undefined) ?? (g.period_key as string | null),
        contributions: (contribMap.get(String(g.id)) ?? []).sort(
          (a, b) => b.amount - a.amount,
        ),
      };
    });
  });
  if (fromDb) return fromDb;

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
  const fromDb = await readDatabase(async (sql) => {
    const data = (await sql`
      select name, total_points, weekly_points, chapter
      from leaderboard_snapshot
      order by total_points desc
      limit 50
    `) as Row[];
    if (!data.length) return null;
    return data.map((row) => ({
      name: String(row.name),
      totalPoints: Number(row.total_points ?? 0),
      weeklyPoints: Number(row.weekly_points ?? 0),
      chapter: Number(row.chapter ?? 1),
    }));
  });
  if (fromDb) return fromDb;

  return tryReadJson<LeaderboardEntry[]>(path.join(DATA_DIR, "leaderboard.json"));
}

export async function getProgressDemo(): Promise<PlayerProgress> {
  return tryReadJson<PlayerProgress>(path.join(DATA_DIR, "progress-demo.json"));
}

export async function getAdminSettings(): Promise<AdminSettings> {
  const fromDb = await readDatabase(async (sql) => {
    const data = (await sql`
      select rewards_enabled, points_enabled, min_chapter_enforced
      from admin_settings
      where id = 1
      limit 1
    `) as Row[];
    const row = data[0];
    if (!row) return null;
    return {
      rewardsEnabled: asBool(row.rewards_enabled, true),
      pointsEnabled: asBool(row.points_enabled, true),
      minChapterEnforced: asBool(row.min_chapter_enforced, true),
    };
  });
  if (fromDb) return fromDb;

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
  const sql = getSql();
  if (sql && kind === "settings") {
    const s = data as AdminSettings;
    await sql`
      insert into admin_settings (
        id,
        rewards_enabled,
        points_enabled,
        min_chapter_enforced,
        updated_at
      ) values (
        1,
        ${s.rewardsEnabled},
        ${s.pointsEnabled},
        ${s.minChapterEnforced},
        now()
      )
      on conflict (id) do update set
        rewards_enabled = excluded.rewards_enabled,
        points_enabled = excluded.points_enabled,
        min_chapter_enforced = excluded.min_chapter_enforced,
        updated_at = excluded.updated_at
    `;
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

export function databaseConfigured(): boolean {
  return hasDatabaseEnv();
}
