import { useTileRegistry } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect } from "react";
import McapCameraTile from "./McapCameraTile";
import McapLidarTile from "./McapLidarTile";

/**
 * Tile catalog for the MCAP adapter. New `type` strings should map to
 * a component here — adding a kind is one entry, not N per-source
 * registrations.
 */
const TILE_BY_TYPE = {
  camera: {
    typeLabel: "Camera",
    icon: IconName.GridView,
    Tile: McapCameraTile,
  },
  lidar: {
    typeLabel: "Lidar",
    icon: IconName.Embeddings,
    Tile: McapLidarTile,
  },
} as const satisfies Record<
  string,
  { typeLabel: string; icon: unknown; Tile: React.ComponentType }
>;

type KnownTileType = keyof typeof TILE_BY_TYPE;

function isKnownTileType(type: string): type is KnownTileType {
  return type in TILE_BY_TYPE;
}

export interface UseMcapTilesOptions {
  /** Unique source types present in the current scene inventory. */
  presentTypes: readonly string[];
}

/**
 * Registers one tile per unique source type in the scene. The "Add
 * tile" menu shows one entry per kind (Camera, Lidar, …); each spawned
 * tile owns its own per-instance topic selection.
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
