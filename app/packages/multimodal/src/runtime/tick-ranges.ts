/** Inclusive range in timeline-index coordinates. */
export interface TickIndexRange {
  readonly endIndex: number;
  readonly startIndex: number;
}

/** Sorts and merges inclusive ranges without imposing a timeline boundary. */
export function normalizeTickRanges(
  ranges: readonly TickIndexRange[],
): TickIndexRange[] {
  const sorted = ranges
    .filter(
      ({ endIndex, startIndex }) =>
        Number.isSafeInteger(startIndex) &&
        startIndex >= 0 &&
        Number.isSafeInteger(endIndex) &&
        endIndex >= 0 &&
        startIndex <= endIndex,
    )
    .map((range) => ({ ...range }))
    .sort((left, right) => left.startIndex - right.startIndex);
  const normalized: TickIndexRange[] = [];
  for (const range of sorted) {
    const last = normalized[normalized.length - 1];
    if (!last || range.startIndex > last.endIndex + 1) {
      normalized.push(range);
    } else if (range.endIndex > last.endIndex) {
      normalized[normalized.length - 1] = {
        ...last,
        endIndex: range.endIndex,
      };
    }
  }
  return normalized;
}

/** Clamps inclusive ranges to a finite timeline, then normalizes them. */
export function clampTickRanges(
  ranges: readonly TickIndexRange[],
  tickCount: number,
): TickIndexRange[] {
  if (!Number.isSafeInteger(tickCount) || tickCount < 0) {
    throw new RangeError("tickCount must be a non-negative safe integer");
  }
  return normalizeTickRanges(
    ranges.map(({ endIndex, startIndex }) => ({
      endIndex: Math.min(tickCount - 1, Math.floor(endIndex)),
      startIndex: Math.max(0, Math.ceil(startIndex)),
    })),
  );
}

/** Union of multiple possibly unsorted/overlapping range sets. */
export function unionAllTickRanges(
  rangeSets: readonly (readonly TickIndexRange[])[],
): TickIndexRange[] {
  return normalizeTickRanges(rangeSets.flatMap((ranges) => [...ranges]));
}

/** Intersection of two possibly unsorted/overlapping range sets. */
export function intersectTickRanges(
  left: readonly TickIndexRange[],
  right: readonly TickIndexRange[],
): TickIndexRange[] {
  const normalizedLeft = normalizeTickRanges(left);
  const normalizedRight = normalizeTickRanges(right);
  const intersections: TickIndexRange[] = [];
  let leftIndex = 0;
  let rightIndex = 0;
  while (
    leftIndex < normalizedLeft.length &&
    rightIndex < normalizedRight.length
  ) {
    const startIndex = Math.max(
      normalizedLeft[leftIndex].startIndex,
      normalizedRight[rightIndex].startIndex,
    );
    const endIndex = Math.min(
      normalizedLeft[leftIndex].endIndex,
      normalizedRight[rightIndex].endIndex,
    );
    if (startIndex <= endIndex) intersections.push({ endIndex, startIndex });
    if (
      normalizedLeft[leftIndex].endIndex < normalizedRight[rightIndex].endIndex
    ) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }
  return intersections;
}

/** Intersection of multiple possibly unsorted/overlapping range sets. */
export function intersectAllTickRanges(
  rangeSets: readonly (readonly TickIndexRange[])[],
): TickIndexRange[] {
  if (rangeSets.length === 0) return [];
  let intersection = normalizeTickRanges(rangeSets[0]);
  for (const ranges of rangeSets.slice(1)) {
    intersection = intersectTickRanges(intersection, ranges);
    if (intersection.length === 0) break;
  }
  return intersection;
}

/** Subtracts inclusive cut ranges from a possibly unsorted range set. */
export function subtractTickRanges(
  ranges: readonly TickIndexRange[],
  removed: readonly TickIndexRange[],
): TickIndexRange[] {
  let remaining = normalizeTickRanges(ranges);
  for (const cut of normalizeTickRanges(removed)) {
    const next: TickIndexRange[] = [];
    for (const range of remaining) {
      if (cut.endIndex < range.startIndex || cut.startIndex > range.endIndex) {
        next.push(range);
        continue;
      }
      if (cut.startIndex > range.startIndex) {
        next.push({
          endIndex: cut.startIndex - 1,
          startIndex: range.startIndex,
        });
      }
      if (cut.endIndex < range.endIndex) {
        next.push({
          endIndex: range.endIndex,
          startIndex: cut.endIndex + 1,
        });
      }
    }
    remaining = next;
  }
  return remaining;
}
