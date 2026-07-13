import type { McapLogConsoleRow } from "./mcap-log-console-rows";

/** Inclusive timeline range represented by a log read or cache window. */
export interface LogReadRange {
  readonly endTimeNs: bigint;
  readonly startTimeNs: bigint;
}

/** Result of merging log rows into a browser-side retention limit. */
export interface BoundedLogRows {
  readonly rows: readonly McapLogConsoleRow[];
  readonly truncated: boolean;
}

/** Row indexes and offset needed to render one virtualized viewport slice. */
export interface VirtualLogRowRange {
  readonly endIndex: number;
  readonly offsetPx: number;
  readonly startIndex: number;
}

/**
 * Merges one ordered read into the active log window while keeping browser
 * work bounded. The newest rows win because follow mode is a live tail; older
 * rows remain available in the MCAP source but are not retained in the tile.
 */
export function mergeBoundedLogRows(
  current: readonly McapLogConsoleRow[],
  incoming: readonly McapLogConsoleRow[],
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
    compareBigInt(left.timeNs, right.timeNs),
  );
  if (rows.length <= rowLimit) {
    return { rows, truncated: false };
  }

  return {
    rows: rows.slice(rows.length - rowLimit),
    truncated: true,
  };
}

/** Retains rows that still fall inside the inclusive active window. */
export function pruneLogRows(
  rows: readonly McapLogConsoleRow[],
  activeWindow: LogReadRange,
): readonly McapLogConsoleRow[] {
  const retainedRows = rows.filter((row) => logRowInWindow(row, activeWindow));
  return retainedRows.length === rows.length ? rows : retainedRows;
}

/** Returns the fixed-height slice that should exist in the DOM. */
export function virtualLogRowRange({
  overscan,
  rowCount,
  rowHeightPx,
  scrollTop,
  viewportHeight,
}: {
  readonly overscan: number;
  readonly rowCount: number;
  readonly rowHeightPx: number;
  readonly scrollTop: number;
  readonly viewportHeight: number;
}): VirtualLogRowRange {
  if (rowCount <= 0 || rowHeightPx <= 0) {
    return { endIndex: 0, offsetPx: 0, startIndex: 0 };
  }

  const safeOverscan = Math.max(0, Math.floor(overscan));
  const safeScrollTop = Math.max(0, scrollTop);
  const firstVisible = Math.min(
    rowCount - 1,
    Math.floor(safeScrollTop / rowHeightPx),
  );
  const visibleCount =
    viewportHeight > 0
      ? Math.ceil(viewportHeight / rowHeightPx)
      : safeOverscan * 2 + 1;
  const startIndex = Math.max(0, firstVisible - safeOverscan);
  const endIndex = Math.min(
    rowCount,
    firstVisible + visibleCount + safeOverscan,
  );

  return {
    endIndex,
    offsetPx: startIndex * rowHeightPx,
    startIndex,
  };
}

function logRowInWindow(
  row: McapLogConsoleRow,
  activeWindow: LogReadRange,
): boolean {
  return (
    row.timeNs >= activeWindow.startTimeNs &&
    row.timeNs <= activeWindow.endTimeNs
  );
}

function compareBigInt(left: bigint, right: bigint): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
