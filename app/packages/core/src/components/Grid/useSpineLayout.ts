import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import {
  gridAspectRatio,
  gridHeaderHeight,
  gridSpacing,
  parseAspectRatio,
} from "./recoil";
import useZoomSetting from "./useZoomSetting";

/**
 * Deterministic layout for the virtual infinite grid.
 *
 * Positioning uses a single uniform row model: row `r = floor(index/itemsPerRow)`,
 * `y = r*rowStride`. `itemsPerRow`/`rowHeight` come only from zoom/width/AR/spacing,
 * never from loaded data — so a given index ALWAYS lands at the same row/position
 * regardless of scroll/load history, and no other page's data is needed. (Fetching
 * is page-aligned separately; see `InfiniteGrid`.) Forced aspect ratio is exact;
 * "auto" uses a representative ratio (~square) for the slot.
 */
export interface SpineLayout {
  itemsPerRow: number;
  rowHeight: number;
  spacing: number;
  rowStride: number;
  cellWidth: number;
  totalCount: number;
  totalRows: number;
  virtualHeight: number;
  /** absolute (pre-vTop) position of a sample index. */
  posOf: (index: number) => { x: number; y: number };
  /** the sample index range intersecting [vTop, vTop+viewportHeight] (+ overscanRows). */
  indexRange: (
    vTop: number,
    viewportHeight: number,
    overscanRows: number
  ) => { start: number; end: number };
}

export default function useSpineLayout(
  width: number,
  // the view's TRUE item count once the spine has revealed it (filtered/grouped/
  // dynamic-group views); null until then, when we fall back to the dataset's
  // estimated sample count (the free, no-query total for a flat dataset).
  revealedTotal: number | null
): SpineLayout {
  const zoom = useZoomSetting();
  const aspectRatioSetting = useRecoilValue(gridAspectRatio);
  const spacing = useRecoilValue(gridSpacing);
  const datasetCount = useRecoilValue(fos.datasetSampleCount) ?? 0;
  const totalCount = revealedTotal ?? datasetCount;
  // top inset = floating action bar height, so row 0 starts below it; scrolling past
  // it slides rows up under the bar.
  const headerOffset = useRecoilValue(gridHeaderHeight);

  return useMemo(() => {
    const safeWidth = Math.max(width, 1);
    // representative aspect ratio: forced ratio when set, else ~square.
    const repAspect = parseAspectRatio(aspectRatioSetting) ?? 1;
    // Target a CONSISTENT tile size (calibrated from the zoom at a fixed reference
    // width), then fit as many columns as the ACTUAL width allows. So a narrower
    // viewport shows FEWER columns at the same tile size — not the same columns shrunk
    // smaller (which perversely packs MORE rows on screen as you narrow the window).
    const REF_WIDTH = 1200;
    const refCols = Math.max(1, zoom(REF_WIDTH) / repAspect);
    const targetTileWidth = REF_WIDTH / refCols;
    const itemsPerRow = Math.max(1, Math.round(safeWidth / targetTileWidth));
    const rowHeight =
      (safeWidth - (itemsPerRow - 1) * spacing) / (itemsPerRow * repAspect);
    const rowStride = rowHeight + spacing;
    const cellWidth = rowHeight * repAspect;
    const totalRows = Math.ceil(totalCount / itemsPerRow);
    // include the header inset so the last row still clears the (overlapping) bar at
    // the bottom of the scroll range.
    const virtualHeight = totalRows * rowStride + headerOffset;

    const posOf = (index: number) => {
      const row = Math.floor(index / itemsPerRow);
      const col = index - row * itemsPerRow;
      return {
        x: col * (cellWidth + spacing),
        y: row * rowStride + headerOffset,
      };
    };

    const indexRange = (
      vTop: number,
      viewportHeight: number,
      overscanRows: number
    ) => {
      // rows live in content space shifted down by headerOffset; map the viewport back.
      const top = vTop - headerOffset;
      const firstRow = Math.max(0, Math.floor(top / rowStride) - overscanRows);
      const lastRow =
        Math.ceil((top + viewportHeight) / rowStride) + overscanRows;
      const start = Math.min(firstRow * itemsPerRow, totalCount);
      const end = Math.min(lastRow * itemsPerRow, totalCount);
      return { start, end: Math.max(start, end) };
    };

    return {
      itemsPerRow,
      rowHeight,
      spacing,
      rowStride,
      cellWidth,
      totalCount,
      totalRows,
      virtualHeight,
      posOf,
      indexRange,
    };
  }, [width, zoom, aspectRatioSetting, spacing, totalCount, headerOffset]);
}
