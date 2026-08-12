/** Row indexes and offset needed to render one fixed-height viewport slice. */
export interface VirtualLogRowRange {
  readonly endIndex: number;
  readonly offsetPx: number;
  readonly startIndex: number;
}

/** Computes the bounded row slice needed for a fixed-height log viewport. */
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
