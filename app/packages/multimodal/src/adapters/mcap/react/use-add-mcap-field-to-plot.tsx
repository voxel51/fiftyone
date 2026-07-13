import {
  addTileToLayout,
  collectTileIds,
  useTiling,
  type TilingTile,
} from "@fiftyone/tiling";
import { useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import type { MosaicNode } from "react-mosaic-component";
import McapPlotTile from "./McapPlotTile";
import {
  addMcapPlotSeriesToTile,
  mcapPlotTileSeriesAtom,
} from "./mcap-plot-tile-state";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";

/**
 * Adds a raw-message numeric field to the first existing plot tile, or
 * creates a plot tile when none exists. The created/target tile is focused.
 */
export function useAddMcapFieldToPlot(): (
  topic: string,
  fieldPath: string,
) => void {
  const { addTile, focusedTileId, layout, setFocusedTileId, tiles } =
    useTiling();
  const setPlotTileSeries = useSetAtom(mcapPlotTileSeriesAtom);
  const stateRef = useRef({ focusedTileId, layout, tiles });
  stateRef.current = { focusedTileId, layout, tiles };

  return useCallback(
    (topic, fieldPath) => {
      const current = stateRef.current;
      let tileId = firstPlotTileId(current.layout, current.tiles);
      if (!tileId) {
        const tile: TilingTile = {
          render: () => <McapPlotTile />,
          title: "Plot",
          type: MCAP_TILE_TYPE.PLOT,
        };
        tileId = addTile(tile, { idPrefix: MCAP_TILE_TYPE.PLOT });
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
        addMcapPlotSeriesToTile(previous, targetTileId, topic, fieldPath),
      );
    },
    // setPlotTileSeries is a stable useSetAtom setter; omitted from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [addTile, setFocusedTileId],
  );
}

function firstPlotTileId(
  layout: MosaicNode<string> | null,
  tiles: Readonly<Record<string, TilingTile>>,
): string | null {
  for (const tileId of collectTileIds(layout)) {
    if (tiles[tileId]?.type === MCAP_TILE_TYPE.PLOT) {
      return tileId;
    }
  }
  return null;
}
