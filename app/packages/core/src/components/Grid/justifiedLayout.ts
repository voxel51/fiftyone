// Justified (auto-AR) layout: greedy row fill from per-item aspect ratios, the
// same family as Spotlight's measured rows but computed from the spine's ARs up
// front, so positions are deterministic and random-access (no load-history
// dependence). All items must have a (possibly fallback) AR.

export interface GridCell {
  x: number;
  y: number;
  width: number;
  height: number;
}

// the layout surface the engine consumes — uniform and justified both implement it
export interface GridLayout {
  totalCount: number;
  virtualHeight: number;
  // representative row height (scroll settle tuning / approximations)
  rowHeight: number;
  cellOf: (index: number) => GridCell;
  indexRange: (
    vTop: number,
    viewportHeight: number,
    overscanRows: number
  ) => { start: number; end: number };
  lastVisibleIndex: (vTop: number, viewportHeight: number) => number;
}

interface Row {
  start: number; // first item index
  count: number;
  height: number;
  y: number; // top (pre-header) of the row
}

export default function justifiedLayout({
  width,
  spacing,
  headerOffset,
  targetRowHeight,
  totalCount,
  aspectRatioOf,
}: {
  width: number;
  spacing: number;
  headerOffset: number;
  targetRowHeight: number;
  totalCount: number;
  // w/h ratio for an index; fall back to ~1 for unknown/invalid
  aspectRatioOf: (index: number) => number | null | undefined;
}): GridLayout {
  const safeWidth = Math.max(width, 1);
  const ar = (index: number) => {
    const value = aspectRatioOf(index);
    return value && value > 0 && Number.isFinite(value) ? value : 1;
  };

  // greedily accumulate items until the row, scaled to fill the width, is no
  // taller than the target; the last row keeps the target height (not stretched).
  const rows: Row[] = [];
  const rowOf = new Int32Array(Math.max(totalCount, 0));
  let y = 0;
  let i = 0;
  while (i < totalCount) {
    let sumAr = 0;
    let count = 0;
    let height = targetRowHeight;
    while (i + count < totalCount) {
      sumAr += ar(i + count);
      count += 1;
      const available = safeWidth - (count - 1) * spacing;
      height = available / sumAr;
      if (height <= targetRowHeight) break;
    }
    const isLastPartial = i + count >= totalCount && height > targetRowHeight;
    const rowHeight = isLastPartial ? targetRowHeight : height;
    for (let k = 0; k < count; k++) rowOf[i + k] = rows.length;
    rows.push({ start: i, count, height: rowHeight, y });
    y += rowHeight + spacing;
    i += count;
  }

  const virtualHeight = y + headerOffset;
  const rowHeight = rows.length ? rows[0].height : targetRowHeight;

  const cellOf = (index: number): GridCell => {
    const row = rows[rowOf[index] ?? 0];
    if (!row)
      return { x: 0, y: headerOffset, width: 0, height: targetRowHeight };
    let x = 0;
    for (let k = row.start; k < index; k++) x += ar(k) * row.height + spacing;
    return {
      x,
      y: row.y + headerOffset,
      width: ar(index) * row.height,
      height: row.height,
    };
  };

  // first row whose bottom is past a content-space y (binary search on row.y).
  const rowAt = (contentY: number) => {
    let lo = 0;
    let hi = rows.length - 1;
    let found = rows.length;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (rows[mid].y + rows[mid].height >= contentY) {
        found = mid;
        hi = mid - 1;
      } else {
        lo = mid + 1;
      }
    }
    return found;
  };

  const indexRange = (
    vTop: number,
    viewportHeight: number,
    overscanRows: number
  ) => {
    if (!rows.length) return { start: 0, end: 0 };
    const top = vTop - headerOffset;
    const firstRow = Math.max(0, rowAt(top) - overscanRows);
    const lastRow = Math.min(
      rows.length - 1,
      rowAt(top + viewportHeight) + overscanRows
    );
    const start = rows[firstRow].start;
    const lastRowObj = rows[lastRow];
    const end = lastRowObj.start + lastRowObj.count;
    return { start, end: Math.max(start, end) };
  };

  const lastVisibleIndex = (vTop: number, viewportHeight: number) => {
    if (!rows.length) return 0;
    const lastRow = Math.min(
      rows.length - 1,
      rowAt(vTop - headerOffset + viewportHeight)
    );
    const row = rows[lastRow];
    return Math.min(totalCount, row.start + row.count);
  };

  return {
    totalCount,
    virtualHeight,
    rowHeight,
    cellOf,
    indexRange,
    lastVisibleIndex,
  };
}
