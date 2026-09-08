import { useRegisteredTiles, useTiling } from "@fiftyone/tiling";
import { useCallback, useRef } from "react";

import type { TileType } from "./tile-types";

/** Returns a host command that focuses or creates one tile archetype. */
export function useOpenTile(type: TileType): () => void {
  const { addTile, setFocusedTileId, tiles } = useTiling();
  const registeredTiles = useRegisteredTiles();
  const tilesRef = useRef(tiles);
  const registeredTilesRef = useRef(registeredTiles);
  tilesRef.current = tiles;
  registeredTilesRef.current = registeredTiles;

  return useCallback(() => {
    const currentTiles = tilesRef.current;
    const existingTileId = Object.keys(currentTiles).find(
      (tileId) => currentTiles[tileId]?.type === type,
    );
    if (existingTileId) {
      setFocusedTileId(existingTileId);
      return;
    }

    const definition = registeredTilesRef.current.find(
      (entry) => entry.type === type,
    );
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
