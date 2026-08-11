import type { EpisodeLogConsoleRow } from "../../../visualization/logs/log-console-rows";
import { compareBigInt, type LogLevel } from "../../../ir";

/** Inclusive timeline range represented by a log read or cache window. */
export interface LogReadRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

/** Result of merging log rows into a browser-side retention limit. */
export interface BoundedLogRows {
  readonly rows: readonly EpisodeLogConsoleRow[];
  readonly truncated: boolean;
}

/** Deduplicates retained read tiles once and orders them by playback time. */
export function orderedUniqueLogRows(
  rowGroups: readonly (readonly EpisodeLogConsoleRow[])[],
): readonly EpisodeLogConsoleRow[] {
  const rowsById = new Map<string, EpisodeLogConsoleRow>();
  for (const rows of rowGroups) {
    for (const row of rows) rowsById.set(row.id, row);
  }
  return [...rowsById.values()].sort(compareLogRows);
}

/**
 * Projects the newest selected-level matches from an already ordered cache.
 * Scanning newest-first means a dense window stops after the cap plus one
 * proof row instead of materializing every match on each Follow tick.
 */
export function selectBoundedLogRows(
  orderedRows: readonly EpisodeLogConsoleRow[],
  activeWindow: LogReadRange,
  rowLimit: number,
  selectedLevels: ReadonlySet<LogLevel>,
): BoundedLogRows {
  if (rowLimit <= 0 || selectedLevels.size === 0) {
    return { rows: [], truncated: false };
  }
  const startIndex = lowerTimelineBound(orderedRows, activeWindow.startTimeNs);
  const endIndex = upperTimelineBound(orderedRows, activeWindow.endTimeNs);
  const newestFirst: EpisodeLogConsoleRow[] = [];
  let truncated = false;
  for (let index = endIndex - 1; index >= startIndex; index -= 1) {
    const row = orderedRows[index];
    // DiagnosticArray messages share the history pipeline for Diagnostics,
    // but they are never ordinary log rows. Keep that invariant here as a
    // final projection guard even if source metadata is incomplete.
    if (row.kind !== "log" || !selectedLevels.has(row.level)) continue;
    if (newestFirst.length >= rowLimit) {
      truncated = true;
      break;
    }
    newestFirst.push(row);
  }
  newestFirst.reverse();
  return { rows: newestFirst, truncated };
}

/** Returns the clamped beginning of a log window centered on a timeline tick. */
export function logWindowStartNs(
  centerTimeNs: bigint,
  beforeNs: bigint,
): bigint {
  return centerTimeNs > beforeNs ? centerTimeNs - beforeNs : 0n;
}

/** Returns the inclusive log read window around a timeline tick. */
export function logWindowForCenter(
  centerTimeNs: bigint,
  beforeNs: bigint,
  afterNs: bigint,
): LogReadRange {
  return {
    endTimeNs: centerTimeNs + afterNs,
    startTimeNs: logWindowStartNs(centerTimeNs, beforeNs),
  };
}

/** Returns the portions of an active window not covered by cached ranges. */
export function missingLogReadRanges(
  cachedRanges: readonly LogReadRange[] | null,
  activeWindow: LogReadRange,
): readonly LogReadRange[] {
  if (!cachedRanges) {
    return [activeWindow];
  }

  const ranges: LogReadRange[] = [];
  let cursor = activeWindow.startTimeNs;
  for (const covered of cachedRanges) {
    if (covered.startTimeNs > cursor) {
      ranges.push({ endTimeNs: covered.startTimeNs, startTimeNs: cursor });
    }
    if (covered.endTimeNs > cursor) {
      cursor = covered.endTimeNs;
    }
    if (cursor >= activeWindow.endTimeNs) {
      break;
    }
  }
  if (cursor < activeWindow.endTimeNs) {
    ranges.push({ endTimeNs: activeWindow.endTimeNs, startTimeNs: cursor });
  }

  return ranges;
}

/** Records how much of a capped log read is known to be covered. */
export function coveredLogReadRange(
  range: LogReadRange,
  messageCount: number,
  lastTimelineTimeNs: bigint | undefined,
  readLimit: number,
): LogReadRange {
  if (messageCount >= readLimit && lastTimelineTimeNs !== undefined) {
    return {
      endTimeNs:
        lastTimelineTimeNs < range.endTimeNs
          ? lastTimelineTimeNs
          : range.endTimeNs,
      startTimeNs: range.startTimeNs,
    };
  }

  return range;
}

/** Clips, sorts, and coalesces cached read ranges inside an active window. */
export function mergeLogReadRanges(
  ranges: readonly LogReadRange[],
  activeWindow: LogReadRange,
): readonly LogReadRange[] {
  const clippedRanges: LogReadRange[] = [];
  for (const range of ranges) {
    const startTimeNs =
      range.startTimeNs > activeWindow.startTimeNs
        ? range.startTimeNs
        : activeWindow.startTimeNs;
    const endTimeNs =
      range.endTimeNs < activeWindow.endTimeNs
        ? range.endTimeNs
        : activeWindow.endTimeNs;
    if (startTimeNs <= endTimeNs) {
      clippedRanges.push({ endTimeNs, startTimeNs });
    }
  }
  clippedRanges.sort((left, right) =>
    compareBigInt(left.startTimeNs, right.startTimeNs),
  );

  const merged: LogReadRange[] = [];
  for (const range of clippedRanges) {
    const previous = merged[merged.length - 1];
    if (!previous || range.startTimeNs > previous.endTimeNs) {
      merged.push(range);
      continue;
    }
    if (range.endTimeNs > previous.endTimeNs) {
      merged[merged.length - 1] = {
        ...previous,
        endTimeNs: range.endTimeNs,
      };
    }
  }

  return merged;
}

/**
 * Merges one ordered read into the active log window while keeping browser
 * work bounded. The newest rows win because follow mode is a live tail; older
 * rows remain available in the retained progressive history for refiltering.
 */
export function mergeBoundedLogRows(
  current: readonly EpisodeLogConsoleRow[],
  incoming: readonly EpisodeLogConsoleRow[],
  activeWindow: LogReadRange,
  rowLimit: number,
): BoundedLogRows {
  const retainedRows = pruneLogRows(current, activeWindow);
  if (incoming.length === 0) {
    return { rows: retainedRows, truncated: false };
  }

  const rowsById = new Map(retainedRows.map((row) => [row.id, row]));
  for (const row of incoming) {
    if (logRowInWindow(row, activeWindow)) {
      rowsById.set(row.id, row);
    }
  }

  const rows = Array.from(rowsById.values()).sort((left, right) =>
    compareLogRows(left, right),
  );
  if (rows.length <= rowLimit) {
    return { rows, truncated: false };
  }

  return {
    rows: rows.slice(rows.length - rowLimit),
    truncated: true,
  };
}

/** Applies the visible-level filter before the browser-side row ceiling. */
export function mergeSelectedBoundedLogRows(
  current: readonly EpisodeLogConsoleRow[],
  incoming: readonly EpisodeLogConsoleRow[],
  activeWindow: LogReadRange,
  rowLimit: number,
  selectedLevels: ReadonlySet<LogLevel>,
): BoundedLogRows {
  return mergeBoundedLogRows(
    current.filter((row) => selectedLevels.has(row.level)),
    incoming.filter((row) => selectedLevels.has(row.level)),
    activeWindow,
    rowLimit,
  );
}

/** Retains rows that still fall inside the inclusive active window. */
export function pruneLogRows(
  rows: readonly EpisodeLogConsoleRow[],
  activeWindow: LogReadRange,
): readonly EpisodeLogConsoleRow[] {
  const retainedRows = rows.filter((row) => logRowInWindow(row, activeWindow));
  return retainedRows.length === rows.length ? rows : retainedRows;
}

function logRowInWindow(
  row: EpisodeLogConsoleRow,
  activeWindow: LogReadRange,
): boolean {
  return (
    row.timelineTimeNs >= activeWindow.startTimeNs &&
    row.timelineTimeNs <= activeWindow.endTimeNs
  );
}

function compareLogRows(
  left: EpisodeLogConsoleRow,
  right: EpisodeLogConsoleRow,
): number {
  return (
    compareBigInt(left.timelineTimeNs, right.timelineTimeNs) ||
    left.id.localeCompare(right.id)
  );
}

function lowerTimelineBound(
  rows: readonly EpisodeLogConsoleRow[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (rows[middle].timelineTimeNs < timeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}

function upperTimelineBound(
  rows: readonly EpisodeLogConsoleRow[],
  timeNs: bigint,
): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (rows[middle].timelineTimeNs <= timeNs) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }
  return low;
}
