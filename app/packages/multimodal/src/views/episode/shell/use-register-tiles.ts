import { useTileRegistry } from "@fiftyone/tiling";
import { useEffect } from "react";

import type { EpisodeTileType } from "../tiles/episode-tile-types";
import { getEpisodeTileDefinition } from "./tile-catalog";

/** Registers the shell-owned tile catalog for the active episode. */
export function useRegisterEpisodeTiles(
  tileTypes: readonly EpisodeTileType[],
): void {
  const { registerTile } = useTileRegistry();

  // This effect registers the available archetypes for this episode and
  // removes them when the shell or its inventory changes.
  useEffect(() => {
    const cleanups = tileTypes.map((type) => {
      const entry = getEpisodeTileDefinition(type);
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
