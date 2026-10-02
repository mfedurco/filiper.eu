/** Previous nicknames, oldest first, without the current name and without duplicates. */

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function add(names: string[], name: string | null | undefined) {
  const trimmed = clean(name);
  if (!trimmed || trimmed.toLowerCase() === "unknown") return;
  if (!names.includes(trimmed)) names.push(trimmed);
}

function addAll(names: string[], note: string | null | undefined) {
  for (const part of clean(note).split(",")) add(names, part);
}

export function mergeNameNote(
  storedNote: string | null | undefined,
  incomingNote: string | null | undefined,
  previousName: string | null | undefined,
  _nextName?: string | null,
): string {
  const names: string[] = [];
  addAll(names, storedNote);
  addAll(names, incomingNote);
  add(names, previousName);
  return names.join(", ");
}

export function previousNames(note: string | null | undefined, current?: string | null): string[] {
  const skip = clean(current);
  return mergeNameNote(note, "", "")
    .split(", ")
    .filter((name) => name && name !== skip);
}
