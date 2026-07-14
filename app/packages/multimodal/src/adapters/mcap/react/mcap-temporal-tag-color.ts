const TEMPORAL_TAG_COLORS = [
  "#f97316",
  "#3b82f6",
  "#10b981",
  "#8b5cf6",
  "#f43f5e",
  "#f59e0b",
  "#06b6d4",
  "#ec4899",
] as const;

/** Returns the stable color assigned to a temporal-tag label. */
export function temporalTagColor(label: string): string {
  let hash = 0;
  for (let index = 0; index < label.length; index++) {
    hash = (hash * 31 + label.charCodeAt(index)) >>> 0;
  }
  return TEMPORAL_TAG_COLORS[hash % TEMPORAL_TAG_COLORS.length];
}
