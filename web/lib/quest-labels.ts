import type { QuestType } from "./types";

export const QUEST_TYPE_LABELS: Record<string, string> = {
  BREAK_BLOCK: "Ťažba / ničenie",
  PLACE_BLOCK: "Stavba",
  KILL_ENTITY: "Lov",
  CRAFT_ITEM: "Craft",
  SMELT_ITEM: "Tavenie",
  PICKUP_ITEM: "Zber",
  ENTER_WORLD: "Cestovanie",
};

export function questTypeLabel(type: QuestType): string {
  return QUEST_TYPE_LABELS[type] ?? type;
}

export function formatMaterial(material: string): string {
  return material
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatTargets(targets: string[], max = 3): string {
  if (!targets?.length) return "—";
  const shown = targets.slice(0, max).map(formatMaterial);
  const rest = targets.length - max;
  return rest > 0 ? `${shown.join(", ")} +${rest}` : shown.join(", ");
}
