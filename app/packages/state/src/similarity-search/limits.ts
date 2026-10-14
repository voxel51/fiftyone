/** Clamp a similarity result count, retaining the previous count for invalid input. */
export function clampSimilarityResultCount(
  raw: number,
  fallback: number,
): number {
  if (!Number.isFinite(raw)) return fallback;
  return Math.min(Math.max(Math.round(raw), 1), 10_000);
}
