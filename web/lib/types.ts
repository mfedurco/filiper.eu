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
};

export type LeaderboardEntry = {
  name: string;
  totalPoints: number;
  weeklyPoints: number;
  chapter: number;
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
  partyQuest: PartyProgress | null;
};

export type AdminSettings = {
  rewardsEnabled: boolean;
  pointsEnabled: boolean;
  minChapterEnforced: boolean;
};
