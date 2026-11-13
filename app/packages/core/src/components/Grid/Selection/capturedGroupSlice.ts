import type { EpisodeSelection } from "@fiftyone/state/src/selection";

/** Prefer a slice represented by the captures, even after browsing elsewhere. */
export function capturedGroupSlice(
  captures: readonly EpisodeSelection[],
  groupField: string | null,
  currentSlice: string | undefined,
): string | undefined {
  if (!groupField) return currentSlice;
  let firstSlice: string | undefined;
  for (const capture of captures) {
    if (capture.unavailable) continue;
    const group = capture.node?.sample[groupField];
    const slice =
      group && typeof group === "object" && "name" in group
        ? group.name
        : capture.groupSlice;
    if (typeof slice !== "string" || !slice) continue;
    if (slice === currentSlice) return currentSlice;
    firstSlice ??= slice;
  }
  return firstSlice ?? currentSlice;
}
