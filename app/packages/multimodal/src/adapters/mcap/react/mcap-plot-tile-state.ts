import { useTileId } from "@fiftyone/tiling";
import { atom, useAtomValue, useStore } from "jotai";
import { useCallback, useMemo } from "react";

/**
 * One series shown by a plot tile: a topic's numeric field, drawn in a
 * fixed color.
 */
export interface McapPlotSeriesConfig {
  readonly color: string;
  readonly fieldPath: string;
  readonly topic: string;
}

/**
 * Categorical series palette, stepped for the fixed dark visualization
 * surface and validated (lightness band, chroma floor, adjacent-pair
 * CVD separation, ≥3:1 contrast on `#050b12`). Slot order maximizes
 * adjacent CVD distance — assign in order, never cycle by hue.
 */
export const MCAP_PLOT_SERIES_PALETTE: readonly string[] = [
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
export const mcapPlotTileSeriesAtom = atom<
  Readonly<Record<string, readonly McapPlotSeriesConfig[]>>
>({});

/** Subscribe to the surrounding plot tile's enabled series. */
export function useMcapPlotTileSeries(): readonly McapPlotSeriesConfig[] {
  const tileId = useTileId();
  const byTile = useAtomValue(mcapPlotTileSeriesAtom);
  return useMemo(
    () => (tileId ? (byTile[tileId] ?? []) : []),
    [byTile, tileId],
  );
}

/**
 * Toggle one topic+field series on the surrounding plot tile. Enabling
 * assigns the first palette color not already used by the tile's
 * series; disabling keeps other series' colors stable (color follows
 * the series, never its position).
 */
export function useToggleMcapPlotSeries(): (
  topic: string,
  fieldPath: string,
  enabled: boolean,
) => void {
  const tileId = useTileId();
  const store = useStore();
  return useCallback(
    (topic, fieldPath, enabled) => {
      if (!tileId) {
        return;
      }
      store.set(mcapPlotTileSeriesAtom, (previous) => {
        const current = previous[tileId] ?? [];
        const exists = current.some(
          (series) => series.topic === topic && series.fieldPath === fieldPath,
        );
        if (enabled === exists) {
          return previous;
        }
        const next = enabled
          ? [
              ...current,
              { color: nextPlotSeriesColor(current), fieldPath, topic },
            ]
          : current.filter(
              (series) =>
                series.topic !== topic || series.fieldPath !== fieldPath,
            );
        return { ...previous, [tileId]: next };
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
  current: readonly McapPlotSeriesConfig[],
): string {
  const used = new Set(current.map((series) => series.color));
  const free = MCAP_PLOT_SERIES_PALETTE.find((color) => !used.has(color));
  return (
    free ??
    MCAP_PLOT_SERIES_PALETTE[current.length % MCAP_PLOT_SERIES_PALETTE.length]
  );
}
