import { getPortalBundle } from "@/lib/portal";
import type {
  Campaign,
  LeaderboardEntry,
  PlayerProgress,
  QuestPool,
  SharedGoal,
} from "@/lib/types";

export async function getCampaign(): Promise<Campaign> {
  return (await getPortalBundle()).campaign;
}

export async function getDailyPool(): Promise<QuestPool> {
  return (await getPortalBundle()).daily;
}

export async function getWeeklyPool(): Promise<QuestPool> {
  return (await getPortalBundle()).weekly;
}

export async function getLongTermPool(): Promise<QuestPool> {
  return (await getPortalBundle()).longterm;
}

export async function getPartyPool(): Promise<QuestPool> {
  return (await getPortalBundle()).party;
}

export async function getSharedGoals(): Promise<SharedGoal[]> {
  return (await getPortalBundle()).shared;
}

export async function getLeaderboard(): Promise<LeaderboardEntry[]> {
  return (await getPortalBundle()).leaderboard;
}

export async function getLivePlayers(): Promise<PlayerProgress[]> {
  return (await getPortalBundle()).players;
}
