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
  addEpisodePlotSeriesToTile,
  episodePlotTileSeriesAtom,
} from "./episode-plot-tile-state";
import { EPISODE_TILE_TYPE } from "./episode-tile-types";
import { getEpisodeTileDefinition } from "./use-episode-tiles";

/**
 * Adds a raw-message numeric field to the first existing plot tile, or
 * creates a plot tile when none exists. The created/target tile is focused.
 */
export function useAddEpisodeFieldToPlot(): (
  stream: string,
  fieldPath: string,
) => void {
  const { addTile, focusedTileId, layout, setFocusedTileId, tiles } =
    useTiling();
  const setPlotTileSeries = useSetAtom(episodePlotTileSeriesAtom);
  const stateRef = useRef({ focusedTileId, layout, tiles });
  stateRef.current = { focusedTileId, layout, tiles };

  return useCallback(
    (stream, fieldPath) => {
      const current = stateRef.current;
      let tileId = firstPlotTileId(current.layout, current.tiles);
      if (!tileId) {
        const definition = getEpisodeTileDefinition(EPISODE_TILE_TYPE.PLOT);
        if (!definition) return;
        const Tile = definition.Tile;
        const tile: TilingTile = {
          render: () => <Tile />,
          title: "Plot",
          type: EPISODE_TILE_TYPE.PLOT,
        };
        tileId = addTile(tile, { idPrefix: EPISODE_TILE_TYPE.PLOT });
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
        addEpisodePlotSeriesToTile(previous, targetTileId, stream, fieldPath),
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
    if (tiles[tileId]?.type === EPISODE_TILE_TYPE.PLOT) {
      return tileId;
    }
  }
  return null;
}
