import * as fos from "@fiftyone/state";
import { useMemo } from "react";
import { useRecoilValue } from "recoil";
import { gridAspectRatio, gridSpacing, parseAspectRatio } from "./recoil";
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

export default function useSpineLayout(width: number): SpineLayout {
  const zoom = useZoomSetting();
  const aspectRatioSetting = useRecoilValue(gridAspectRatio);
  const spacing = useRecoilValue(gridSpacing);
  const totalCount = useRecoilValue(fos.datasetSampleCount) ?? 0;

  return useMemo(() => {
    const safeWidth = Math.max(width, 1);
    const threshold = Math.max(zoom(safeWidth), 1);
    // representative aspect ratio: forced ratio when set, else ~square.
    const repAspect = parseAspectRatio(aspectRatioSetting) ?? 1;
    const itemsPerRow = Math.max(1, Math.round(threshold / repAspect));
    const rowHeight =
      (safeWidth - (itemsPerRow - 1) * spacing) / (itemsPerRow * repAspect);
    const rowStride = rowHeight + spacing;
    const cellWidth = rowHeight * repAspect;
    const totalRows = Math.ceil(totalCount / itemsPerRow);
    const virtualHeight = totalRows * rowStride;

    const posOf = (index: number) => {
      const row = Math.floor(index / itemsPerRow);
      const col = index - row * itemsPerRow;
      return { x: col * (cellWidth + spacing), y: row * rowStride };
    };

    const indexRange = (
      vTop: number,
      viewportHeight: number,
      overscanRows: number
    ) => {
      const firstRow = Math.max(0, Math.floor(vTop / rowStride) - overscanRows);
      const lastRow =
        Math.ceil((vTop + viewportHeight) / rowStride) + overscanRows;
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
  }, [width, zoom, aspectRatioSetting, spacing, totalCount]);
}
