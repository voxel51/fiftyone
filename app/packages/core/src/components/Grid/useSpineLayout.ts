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
 * `itemsPerRow`/`rowHeight` come only from zoom/width/AR/spacing, never from loaded
 * data, so a given index always lands at the same position regardless of load history.
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
  // the view's item count once the spine reveals it; null until then, falling back to
  // the dataset's estimated sample count.
  revealedTotal: number | null
): SpineLayout {
  const zoom = useZoomSetting();
  const aspectRatioSetting = useRecoilValue(gridAspectRatio);
  const spacing = useRecoilValue(gridSpacing);
  const datasetCount = useRecoilValue(fos.datasetSampleCount) ?? 0;
  const totalCount = revealedTotal ?? datasetCount;
  // top inset = action bar height, so row 0 starts below it.
  const headerOffset = useRecoilValue(gridHeaderHeight);

  return useMemo(() => {
    const safeWidth = Math.max(width, 1);
    // representative aspect ratio: forced ratio when set, else ~square.
    const repAspect = parseAspectRatio(aspectRatioSetting) ?? 1;
    // target a fixed tile size, then fit as many columns as the width allows, so a
    // narrower viewport shows fewer columns rather than shrinking them
    const REF_WIDTH = 1200;
    const refCols = Math.max(1, zoom(REF_WIDTH) / repAspect);
    const targetTileWidth = REF_WIDTH / refCols;
    const itemsPerRow = Math.max(1, Math.round(safeWidth / targetTileWidth));
    const rowHeight =
      (safeWidth - (itemsPerRow - 1) * spacing) / (itemsPerRow * repAspect);
    const rowStride = rowHeight + spacing;
    const cellWidth = rowHeight * repAspect;
    const totalRows = Math.ceil(totalCount / itemsPerRow);
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
      // rows are shifted down by headerOffset; map the viewport back into content space.
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
