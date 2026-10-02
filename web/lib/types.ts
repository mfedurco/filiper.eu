export type RewardItem = {
  material: string;
  amount: number;
};

export type QuestType =
  | "BREAK_BLOCK"
  | "PLACE_BLOCK"
  | "KILL_ENTITY"
  | "CRAFT_ITEM"
  | "SMELT_ITEM"
  | "PICKUP_ITEM"
  | "ENTER_WORLD"
  | string;

export type GoalKind =
  | "daily"
  | "weekly"
  | "long_term"
  | "shared"
  | "campaign"
  | "party";

export type Quest = {
  id: string;
  name: string;
  description: string;
  type: QuestType;
  targets: string[];
  amount: number;
  points: number;
  rewards?: RewardItem[];
  minChapter?: number;
  kind?: GoalKind;
  periodKey?: string | null;
};

export type Milestone = {
  name: string;
  rewards: RewardItem[];
  points: number;
};

export type Chapter = {
  id: string;
  order: number;
  name: string;
  description: string;
  quests: Quest[];
  milestone: Milestone;
};

export type Campaign = {
  title: string;
  chapters: Chapter[];
};

export type QuestPool = {
  pool: Quest[];
  periodKey?: string;
};

export type LeaderboardEntry = {
  name: string;
  uuid: string;
  totalPoints: number;
  weeklyPoints: number;
  chapter: number;
};

export type Contribution = {
  name: string;
  amount: number;
  uuid?: string;
};

export type SharedGoal = Quest & {
  progress: number;
  completed: boolean;
  contributions: Contribution[];
  periodKey?: string | null;
};

export type QuestProgressEntry = {
  current: number;
  target: number;
};

export type DailyProgress = {
  id: string;
  name: string;
  current: number;
  target: number;
  completed: boolean;
};

export type PartyProgress = {
  id: string;
  name: string;
  current: number;
  target: number;
  completed: boolean;
  partyName: string;
};

export type PlayerProgress = {
  playerName: string;
  uuid: string;
  currentChapter: number;
  chapterName: string;
  totalPoints: number;
  weeklyPoints: number;
  completedQuests: string[];
  questProgress: Record<string, QuestProgressEntry>;
  completedMilestones: string[];
  dailyQuests: DailyProgress[];
  weeklyQuests?: DailyProgress[];
  longTermQuests?: DailyProgress[];
  partyQuest: PartyProgress | null;
};

export type AdminSettings = {
  rewardsEnabled: boolean;
  pointsEnabled: boolean;
  minChapterEnforced: boolean;
};
