import { useTileRegistry } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect } from "react";
import McapCameraTile from "./McapCameraTile";
import McapLidarTile from "./McapLidarTile";

/**
 * Tile catalog for the MCAP adapter. One entry per kind — adding a
 * new tile type is a single map entry, not N per-source registrations.
 */
const TILE_BY_TYPE = {
  camera: {
    typeLabel: "Camera",
    icon: IconName.GridView,
    Tile: McapCameraTile as unknown as React.ComponentType,
  },
  lidar: {
    typeLabel: "Lidar",
    icon: IconName.Embeddings,
    Tile: McapLidarTile as unknown as React.ComponentType,
  },
} as const;

type KnownTileType = keyof typeof TILE_BY_TYPE;

function isKnownTileType(type: string): type is KnownTileType {
  return type in TILE_BY_TYPE;
}

export interface UseMcapTilesOptions {
  /** Unique tile types present in the current scene. */
  presentTypes: readonly string[];
}

/**
 * Registers one tile per unique source type present. The "Add tile"
 * menu shows one item per kind (Camera, Lidar, …); the initial-tiles
 * map threads a `topic` prop into each instance's render closure.
 */
export function useMcapTiles({ presentTypes }: UseMcapTilesOptions): void {
  const { registerTile } = useTileRegistry();

  useEffect(() => {
    const cleanups = presentTypes.flatMap((type) => {
      if (!isKnownTileType(type)) return [];
      const entry = TILE_BY_TYPE[type];
      return [
        registerTile({
          type,
          typeLabel: entry.typeLabel,
          icon: entry.icon,
          Tile: entry.Tile,
        }),
      ];
    });
    return () => cleanups.forEach((c) => c());
  }, [presentTypes, registerTile]);
}
