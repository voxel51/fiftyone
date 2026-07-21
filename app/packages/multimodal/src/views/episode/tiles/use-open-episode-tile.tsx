import { useTiling } from "@fiftyone/tiling";
import { useCallback, useRef } from "react";

import { getEpisodeTileDefinition } from "./episode-tile-catalog";
import type { EpisodeTileType } from "./episode-tile-types";

/** Returns a host command that focuses or creates one tile archetype. */
export function useOpenEpisodeTile(type: EpisodeTileType): () => void {
  const { addTile, setFocusedTileId, tiles } = useTiling();
  const tilesRef = useRef(tiles);
  tilesRef.current = tiles;

  return useCallback(() => {
    const currentTiles = tilesRef.current;
    const existingTileId = Object.keys(currentTiles).find(
      (tileId) => currentTiles[tileId]?.type === type,
    );
    if (existingTileId) {
      setFocusedTileId(existingTileId);
      return;
    }

    const definition = getEpisodeTileDefinition(type);
    if (!definition) {
      return;
    }
    const Tile = definition.Tile;
    const tile = {
      render: () => <Tile />,
      title: definition.typeLabel,
      type,
    };
    const tileId = addTile(tile, { idPrefix: type });
    tilesRef.current = { ...currentTiles, [tileId]: tile };
  }, [addTile, setFocusedTileId, type]);
}
