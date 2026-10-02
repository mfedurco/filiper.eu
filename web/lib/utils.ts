export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function clampPercent(current: number, target: number): number {
  if (target <= 0 || current <= 0) return 0;
  const raw = (current / target) * 100;
  if (raw < 1) return 1;
  return Math.min(100, Math.round(raw));
}
