import { collectTileIds, useTiling } from "@fiftyone/tiling";
import { useStore } from "jotai";
import { useCallback } from "react";
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
  const { addTile, layout, setFocusedTileId, tiles } = useTiling();
  const store = useStore();

  return useCallback(
    (topic, fieldPath) => {
      let tileId = firstPlotTileId(layout, tiles);
      if (!tileId) {
        tileId = addTile(
          {
            render: () => <McapPlotTile />,
            title: "Plot",
            type: MCAP_TILE_TYPE.PLOT,
          },
          { idPrefix: MCAP_TILE_TYPE.PLOT },
        );
      }
      const targetTileId = tileId;
      setFocusedTileId(targetTileId);
      store.set(mcapPlotTileSeriesAtom, (previous) =>
        addMcapPlotSeriesToTile(previous, targetTileId, topic, fieldPath),
      );
    },
    [addTile, layout, setFocusedTileId, store, tiles],
  );
}

function firstPlotTileId(
  layout: MosaicNode<string> | null,
  tiles: Readonly<Record<string, { readonly type?: string }>>,
): string | null {
  for (const tileId of collectTileIds(layout)) {
    if (tiles[tileId]?.type === MCAP_TILE_TYPE.PLOT) {
      return tileId;
    }
  }
  return null;
}
