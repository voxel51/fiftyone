import { useTileRegistry } from "@fiftyone/tiling";
import { useEffect } from "react";

import type { TileType } from "../tiles/tile-types";
import { getTileDefinition } from "./tile-catalog";

/** Registers the shell-owned tile catalog for the active episode. */
export function useRegisterTiles(tileTypes: readonly TileType[]): void {
  const { registerTile } = useTileRegistry();

  // This effect registers the available archetypes for this episode and
  // removes them when the shell or its inventory changes.
  useEffect(() => {
    const cleanups = tileTypes.map((type) => {
      const entry = getTileDefinition(type);
      if (!entry) return () => undefined;
      return registerTile({
        type,
        typeLabel: entry.typeLabel,
        icon: entry.icon,
        Tile: entry.Tile,
      });
    });
    return () => cleanups.forEach((cleanup) => cleanup());
  }, [registerTile, tileTypes]);
}
