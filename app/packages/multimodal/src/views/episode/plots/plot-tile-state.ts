import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";

/**
 * One series shown by a plot tile: a stream's numeric field, drawn in a
 * fixed color.
 */
export interface PlotSeriesConfig {
  readonly color: string;
  readonly fieldPath: string;
  readonly stream: string;
}

/**
 * Categorical series palette, stepped for the fixed dark visualization
 * surface and validated (lightness band, chroma floor, adjacent-pair
 * CVD separation, ≥3:1 contrast on `#050b12`). Slot order maximizes
 * adjacent CVD distance — assign in order, never cycle by hue.
 */
export const PLOT_SERIES_PALETTE: readonly string[] = [
  "#3987e5",
  "#199e70",
  "#c98500",
  "#008300",
  "#9085e9",
  "#e66767",
  "#d55181",
  "#d95926",
];

/**
 * Enabled series per plot tile (tile id → ordered series list). Lives
 * in the tiling shell's per-instance Jotai store, so state is scoped to
 * one modal and vanishes with it; layout persistence snapshots it per
 * dataset.
 */
export const plotTileSeriesAtom = atom<
  Readonly<Record<string, readonly PlotSeriesConfig[]>>
>({});

/**
 * Adds one stream+field series to a specific plot tile. Existing series
 * are left untouched so repeated "add to plot" actions are idempotent.
 */
export function addPlotSeriesToTile(
  previous: Readonly<Record<string, readonly PlotSeriesConfig[]>>,
  tileId: string,
  stream: string,
  fieldPath: string,
): Readonly<Record<string, readonly PlotSeriesConfig[]>> {
  const current = previous[tileId] ?? [];
  const exists = current.some(
    (series) => series.stream === stream && series.fieldPath === fieldPath,
  );
  if (exists) {
    return previous;
  }
  return {
    ...previous,
    [tileId]: [
      ...current,
      { color: nextPlotSeriesColor(current), fieldPath, stream },
    ],
  };
}

/** Subscribe to the surrounding plot tile's enabled series. */
export function usePlotTileSeries(): readonly PlotSeriesConfig[] {
  const tileId = useTileId();
  const byTile = useAtomValue(plotTileSeriesAtom);
  return useMemo(
    () => (tileId ? (byTile[tileId] ?? []) : []),
    [byTile, tileId],
  );
}

/**
 * Toggle one stream+field series on the surrounding plot tile. Enabling
 * assigns the first palette color not already used by the tile's
 * series; disabling keeps other series' colors stable (color follows
 * the series, never its position).
 */
export function useTogglePlotSeries(): (
  stream: string,
  fieldPath: string,
  enabled: boolean,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (stream, fieldPath, enabled) => {
      if (!tileId) {
        return;
      }
      store.set(plotTileSeriesAtom, (previous) => {
        const current = previous[tileId] ?? [];
        const exists = current.some(
          (series) =>
            series.stream === stream && series.fieldPath === fieldPath,
        );
        if (enabled === exists) {
          return previous;
        }
        if (enabled) {
          return addPlotSeriesToTile(previous, tileId, stream, fieldPath);
        }
        return {
          ...previous,
          [tileId]: current.filter(
            (series) =>
              series.stream !== stream || series.fieldPath !== fieldPath,
          ),
        };
      });
    },
    [store, tileId],
  );
}

/**
 * First palette color no current series uses; wraps by usage count when
 * a tile holds more than eight series.
 */
export function nextPlotSeriesColor(
  current: readonly PlotSeriesConfig[],
): string {
  const used = new Set(current.map((series) => series.color));
  const free = PLOT_SERIES_PALETTE.find((color) => !used.has(color));
  return (
    free ?? PLOT_SERIES_PALETTE[current.length % PLOT_SERIES_PALETTE.length]
  );
}
