import actions from "@/data/matrices/actions.json";
import materials from "@/data/matrices/materials.json";
import names from "@/data/matrices/names.json";
import themes from "@/data/matrices/themes.json";

export type MatrixMaterial = {
  id: string;
  label: string;
  tracking: string[];
};

export type MatrixAction = {
  tracking: string;
  verb: string;
  role: string;
};

export type MatrixTheme = {
  id: string;
  label: string;
  place: string;
  mood: string;
};

export const MATRIX_MATERIALS = materials as MatrixMaterial[];
export const MATRIX_ACTIONS = actions as MatrixAction[];
export const MATRIX_THEMES = themes as MatrixTheme[];
export const NAME_PATTERNS = names.patterns;

const MATERIAL_LABEL = new Map(MATRIX_MATERIALS.map((item) => [item.id, item.label]));

export function materialLabel(id: string): string {
  return MATERIAL_LABEL.get(id) ?? id.toLowerCase().replaceAll("_", " ");
}

export function materialsFor(tracking: string): MatrixMaterial[] {
  return MATRIX_MATERIALS.filter((item) => item.tracking.includes(tracking));
}

export const TRACKING_OPTIONS = [
  { id: "break_block", label: "Ťažba blokov" },
  { id: "place_block", label: "Stavanie" },
  { id: "pickup", label: "Zber" },
  { id: "craft", label: "Výroba" },
  { id: "smelt", label: "Tavenie" },
  { id: "kill", label: "Lov" },
  { id: "enter_world", label: "Cesta do sveta" },
  { id: "join", label: "Prihlásenie" },
] as const;

export function trackingLabel(tracking: string): string {
  return TRACKING_OPTIONS.find((item) => item.id === tracking)?.label ?? tracking;
}

export function goalSentence(tracking: string, count: number, filters: string[]): string {
  const what = filters.length
    ? filters.map((id) => materialLabel(id)).join(", ")
    : "cieľ";
  switch (tracking) {
    case "break_block":
      return `Vylám ${count}× ${what}.`;
    case "place_block":
      return `Polož ${count}× ${what}.`;
    case "pickup":
      return `Pozbieraj ${count}× ${what}.`;
    case "craft":
      return `Vyrob ${count}× ${what}.`;
    case "smelt":
      return `Vytav ${count}× ${what}.`;
    case "kill":
      return `Poraz ${count}× ${what}.`;
    case "enter_world":
      return `Navštív svet ${what}.`;
    case "join":
      return "Prihlás sa na server.";
    default:
      return `Splň ${count}× ${what}.`;
  }
}

type Rng = () => number;

function mulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: Rng, items: T[]): T {
  return items[Math.floor(rng() * items.length)]!;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export type GeneratedQuest = {
  kind: "kampan" | "denne" | "tyzdenne" | "dlhodobe" | "spolocne" | "party";
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

export type GeneratedExpedition = {
  title: string;
  description: string;
  themeLabel: string;
  quests: GeneratedQuest[];
};

const PACKAGE: { kind: GeneratedQuest["kind"]; count: number; amounts: number[]; points: number[] }[] = [
  { kind: "kampan", count: 6, amounts: [16, 24, 32, 48], points: [10, 15, 20] },
  { kind: "denne", count: 6, amounts: [12, 16, 24, 32], points: [8, 10, 12] },
  { kind: "tyzdenne", count: 4, amounts: [40, 64, 80], points: [30, 40, 55] },
  { kind: "dlhodobe", count: 3, amounts: [150, 250, 400], points: [120, 160, 180] },
  { kind: "spolocne", count: 3, amounts: [200, 400, 800], points: [50, 70, 90] },
  { kind: "party", count: 3, amounts: [30, 48, 64], points: [25, 40, 55] },
];

function fill(pattern: string, values: Record<string, string>): string {
  return pattern.replace(/\{(\w+)\}/g, (_, key: string) => values[key] ?? "");
}

export function generateExpedition(seed = Date.now()): GeneratedExpedition {
  const rng = mulberry32(seed);
  const theme = pick(rng, MATRIX_THEMES);
  const usedTitles = new Set<string>();
  const quests: GeneratedQuest[] = [];

  for (const slot of PACKAGE) {
    for (let index = 0; index < slot.count; index += 1) {
      const action = pick(rng, MATRIX_ACTIONS);
      const options = materialsFor(action.tracking);
      const material = pick(rng, options);
      const companion = options.length > 1 ? pick(rng, options.filter((item) => item.id !== material.id)) : null;
      const filters = companion && rng() > 0.55 ? [material.id, companion.id] : [material.id];
      const amount = pick(rng, slot.amounts);
      const points = pick(rng, slot.points);
      let title = "";
      for (let attempt = 0; attempt < 8 && (title === "" || usedTitles.has(title)); attempt += 1) {
        const pattern = pick(rng, NAME_PATTERNS);
        title = capitalize(
          fill(pattern, {
            mood: theme.mood,
            role: action.role,
            material: material.label,
            place: theme.place,
          }),
        );
      }
      usedTitles.add(title);
      const chapterIndex = slot.kind === "kampan" ? Math.floor(index / 3) + 1 : null;
      const chapterTitle = chapterIndex === 1 ? `Prvé kroky ${theme.place}` : chapterIndex === 2 ? `Hlbšie ${theme.place}` : null;
      quests.push({
        kind: slot.kind,
        title,
        description: `${action.verb} ${amount}× ${filters.map((id) => materialLabel(id)).join(" a ")} ${theme.place}.`,
        points,
        targetCount: action.tracking === "enter_world" ? 1 : amount,
        tracking: action.tracking,
        filters,
        minChapter: chapterIndex ?? Math.min(4, 1 + Math.floor(index / 2)),
        rewards: [{ material: material.id === "ANY_SOLID" ? "BREAD" : "BREAD", amount: slot.kind === "dlhodobe" ? 8 : 4 }],
        sortOrder: index,
        chapterKey: chapterIndex ? `chapter_${chapterIndex}` : null,
        chapterOrder: chapterIndex,
        chapterTitle,
        chapterDescription: chapterTitle
          ? `Kapitola výpravy „${theme.label}“.`
          : null,
        milestoneName: chapterTitle ? `Milník: ${chapterTitle}` : null,
        milestonePoints: chapterIndex === 1 ? 40 : chapterIndex === 2 ? 70 : null,
        milestoneRewards: chapterTitle ? [{ material: "EMERALD", amount: chapterIndex === 1 ? 4 : 8 }] : null,
      });
    }
  }

  return {
    title: capitalize(`${theme.mood} výprava: ${theme.label}`),
    description: `Mesačný návrh z matríc. Téma je ${theme.label}, úlohy sa dejú ${theme.place}. Pred spustením uprav texty a dátumy.`,
    themeLabel: theme.label,
    quests,
  };
}

export function slugify(value: string): string {
  const map: Record<string, string> = {
    á: "a", ä: "a", č: "c", ď: "d", é: "e", í: "i", ĺ: "l", ľ: "l", ň: "n",
    ó: "o", ô: "o", ŕ: "r", š: "s", ť: "t", ú: "u", ý: "y", ž: "z",
  };
  const ascii = value
    .toLowerCase()
    .replace(/[áäčďéíĺľňóôŕšťúýž]/g, (char) => map[char] ?? char)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return ascii || "vyprava";
}
