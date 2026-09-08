/** Compares normalized frame identifiers in stable lexical order. */
export function compareFrameIds(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

/** Trims, removes empty and duplicate frame identifiers, then sorts them. */
export function uniqueSortedFrameIds(
  frameIds: readonly string[],
): readonly string[] {
  return [...new Set(frameIds.map((id) => id.trim()).filter(Boolean))].sort(
    compareFrameIds,
  );
}
