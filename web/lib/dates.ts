const ZONE = "Europe/Bratislava";

export function formatSkDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("sk-SK", {
    timeZone: ZONE,
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).format(date);
}

export function formatSkRange(
  startsAt: string | null | undefined,
  endsAt: string | null | undefined,
): string {
  return `${formatSkDate(startsAt)} – ${formatSkDate(endsAt)}`;
}

export function toBratislavaInput(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
  return parts.replace(" ", "T");
}

export function bratislavaSql(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) return null;
  return trimmed.replace("T", " ");
}
