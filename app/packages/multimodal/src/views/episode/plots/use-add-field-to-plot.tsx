import {
  addTileToLayout,
  collectTileIds,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import type { MosaicNode } from "react-mosaic-component";
import {
  addPlotSeriesToTile,
  plotTileResetZoomRevisionAtom,
  plotTileSeriesAtom,
} from "./plot-tile-state";
import PlotTile from "./PlotTile";
import { TILE_TYPE } from "../tiles/tile-types";

/**
 * Adds a raw-message numeric field to the first existing plot tile, or
 * creates a plot tile when none exists. The created/target tile is focused.
 */
export function useAddFieldToPlot(): (
  stream: string,
  fieldPath: string,
) => void {
  const { addTile, focusedTileId, layout, setFocusedTileId, tiles } =
    useTiling();
  const setResetZoomRevision = useSetAtom(plotTileResetZoomRevisionAtom);
  const setPlotTileSeries = useSetAtom(plotTileSeriesAtom);
  const stateRef = useRef({ focusedTileId, layout, tiles });
  stateRef.current = { focusedTileId, layout, tiles };

  return useCallback(
    (stream, fieldPath) => {
      const current = stateRef.current;
      let tileId = firstPlotTileId(current.layout, current.tiles);
      if (!tileId) {
        const tile: TilingTile = {
          render: () => <PlotTile />,
          title: "Plot",
          type: TILE_TYPE.PLOT,
        };
        tileId = addTile(tile, { idPrefix: TILE_TYPE.PLOT });
        stateRef.current = {
          layout: addTileToLayout(
            current.layout,
            tileId,
            current.focusedTileId,
          ),
          tiles: { ...current.tiles, [tileId]: tile },
          focusedTileId: tileId,
        };
      }
      const targetTileId = tileId;
      setFocusedTileId(targetTileId);
      setPlotTileSeries((previous) =>
        addPlotSeriesToTile(previous, targetTileId, stream, fieldPath),
      );
      setResetZoomRevision((previous) => ({
        ...previous,
        [targetTileId]: (previous[targetTileId] ?? 0) + 1,
      }));
    },
    [addTile, setFocusedTileId, setPlotTileSeries, setResetZoomRevision],
  );
}

function firstPlotTileId(
  layout: MosaicNode<string> | null,
  tiles: Readonly<Record<string, TilingTile>>,
): string | null {
  for (const tileId of collectTileIds(layout)) {
    if (tiles[tileId]?.type === TILE_TYPE.PLOT) {
      return tileId;
    }
  }
  return null;
}
