import { promises as fs } from "fs";
import path from "path";
import type {
  AdminSettings,
  Campaign,
  LeaderboardEntry,
  PlayerProgress,
  QuestPool,
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

function remoteBase(): string | undefined {
  const base = process.env.NEXT_PUBLIC_VYPRVA_API_URL?.trim();
  return base ? base.replace(/\/$/, "") : undefined;
}

async function fetchRemote<T>(endpoint: string): Promise<T | null> {
  const base = remoteBase();
  if (!base) return null;
  const res = await fetch(`${base}${endpoint}`, {
    next: { revalidate: 30 },
  });
  if (!res.ok) {
    throw new Error(`Vzdialené API vrátilo ${res.status}`);
  }
  return (await res.json()) as T;
}

export async function getCampaign(): Promise<Campaign> {
  try {
    const remote = await fetchRemote<Campaign>("/campaign");
    if (remote) return remote;
  } catch {
    // fallback to local
  }
  return tryReadJson<Campaign>(
    path.join(QUESTS_DIR, "campaign.json"),
    path.join(DATA_DIR, "campaign.json"),
  );
}

export async function getDailyPool(): Promise<QuestPool> {
  try {
    const remote = await fetchRemote<QuestPool>("/daily");
    if (remote) return remote;
  } catch {
    // fallback
  }
  return tryReadJson<QuestPool>(
    path.join(QUESTS_DIR, "daily.json"),
    path.join(DATA_DIR, "daily.json"),
  );
}

export async function getPartyPool(): Promise<QuestPool> {
  try {
    const remote = await fetchRemote<QuestPool>("/party");
    if (remote) return remote;
  } catch {
    // fallback
  }
  return tryReadJson<QuestPool>(
    path.join(QUESTS_DIR, "party.json"),
    path.join(DATA_DIR, "party.json"),
  );
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  try {
    const remote = await fetchRemote<LeaderboardEntry[]>("/leaderboard");
    if (remote) return remote;
  } catch {
    // fallback
  }
  return tryReadJson<LeaderboardEntry[]>(
    path.join(DATA_DIR, "leaderboard.json"),
  );
}

export async function getProgressDemo(): Promise<PlayerProgress> {
  try {
    const remote = await fetchRemote<PlayerProgress>("/progress/demo");
    if (remote) return remote;
  } catch {
    // fallback
  }
  return tryReadJson<PlayerProgress>(
    path.join(DATA_DIR, "progress-demo.json"),
  );
}

export async function getAdminSettings(): Promise<AdminSettings> {
  try {
    return await readJsonFile<AdminSettings>(
      path.join(QUESTS_DIR, "settings.json"),
    );
  } catch {
    return {
      rewardsEnabled: true,
      pointsEnabled: true,
      minChapterEnforced: true,
    };
  }
}

export async function writeQuestData(
  kind: "campaign" | "daily" | "party" | "settings",
  data: unknown,
): Promise<void> {
  await fs.mkdir(QUESTS_DIR, { recursive: true });
  const file = path.join(QUESTS_DIR, `${kind}.json`);
  await fs.writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");

  // Keep public mirrors in sync for campaign/daily/party
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
