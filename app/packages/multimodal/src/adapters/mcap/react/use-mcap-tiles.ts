import { useTileRegistry } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect } from "react";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import McapCameraTile from "./McapCameraTile";
import McapLidarTile from "./McapLidarTile";

/**
 * Tile catalog for the MCAP adapter, keyed by scene-source type. One
 * entry per kind — adding a new tile type is a single map entry, not N
 * per-source registrations. (Annotation sources have no tile of their
 * own; they render as overlays inside camera tiles.)
 */
const TILE_BY_TYPE = {
  [MCAP_SOURCE_TYPE.CAMERA]: {
    typeLabel: "Camera",
    icon: IconName.GridView,
    Tile: McapCameraTile as unknown as React.ComponentType,
  },
  [MCAP_SOURCE_TYPE.LIDAR]: {
    typeLabel: "Lidar",
    icon: IconName.Embeddings,
    Tile: McapLidarTile as unknown as React.ComponentType,
  },
} as const;

type KnownTileType = keyof typeof TILE_BY_TYPE;

function isKnownTileType(type: string): type is KnownTileType {
  return Object.hasOwn(TILE_BY_TYPE, type);
}

/**
 * Catalog lookup for layout restore: the component + label backing a
 * tile type, or `null` for unknown types (e.g. a persisted layout from
 * a build with more tile kinds).
 */
export function getMcapTileDefinition(
  type: string
): { typeLabel: string; Tile: React.ComponentType } | null {
  return isKnownTileType(type) ? TILE_BY_TYPE[type] : null;
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
