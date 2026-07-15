import { useTileRegistry } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect } from "react";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import Mcap3dTile from "./Mcap3dTile";
import McapImageTile from "./McapImageTile";
import McapLogConsoleTile from "./McapLogConsoleTile";
import McapMapTile from "./McapMapTile";
import McapPlotTile from "./McapPlotTile";
import McapRawMessageTile from "./McapRawMessageTile";
import {
  MCAP_TILE_TYPE,
  type McapTileProps,
  type McapTileType,
} from "./mcap-tile-types";

export { MCAP_TILE_TYPE } from "./mcap-tile-types";
export type { McapTileProps, McapTileType } from "./mcap-tile-types";

/**
 * Tile catalog for the MCAP adapter, keyed by tile type. A tile kind is
 * named for what it renders ("Image", "3D"), not for the sensor behind
 * it; `sourceTypes` lists the scene-source types the tile can display,
 * which gates when the kind is offered. Annotation sources render inside the
 * image or 3D tile that matches their dimensionality.
 */
const TILE_BY_TYPE: Record<
  McapTileType,
  {
    typeLabel: string;
    icon: IconName;
    Tile: React.ComponentType<McapTileProps>;
    sourceTypes: readonly string[];
  }
> = {
  [MCAP_TILE_TYPE.IMAGE]: {
    typeLabel: "Image",
    icon: IconName.GridView,
    Tile: McapImageTile,
    sourceTypes: [MCAP_SOURCE_TYPE.IMAGE],
  },
  [MCAP_TILE_TYPE.LOG]: {
    typeLabel: "Logs",
    icon: IconName.Logs,
    Tile: McapLogConsoleTile,
    sourceTypes: [MCAP_SOURCE_TYPE.LOG],
  },
  [MCAP_TILE_TYPE.MAP]: {
    typeLabel: "Map",
    icon: IconName.Polyline,
    Tile: McapMapTile,
    sourceTypes: [MCAP_SOURCE_TYPE.LOCATION],
  },
  [MCAP_TILE_TYPE.THREE_D]: {
    typeLabel: "3D",
    icon: IconName.Embeddings,
    Tile: Mcap3dTile,
    sourceTypes: [
      MCAP_SOURCE_TYPE.MAP_LAYER,
      MCAP_SOURCE_TYPE.POINT_CLOUD,
      MCAP_SOURCE_TYPE.POSE,
      MCAP_SOURCE_TYPE.SCENE_ANNOTATION,
    ],
  },
  // Plottable topics are exactly the ones the scene inventory omits
  // (telemetry has no visualization), so the plot tile is offered
  // whenever the modal has any source at all; its settings sidebar
  // enumerates numeric fields independently of scene sources.
  [MCAP_TILE_TYPE.PLOT]: {
    typeLabel: "Plot",
    icon: IconName.Insights,
    Tile: McapPlotTile,
    sourceTypes: Object.values(MCAP_SOURCE_TYPE),
  },
  // Like the plot tile, the raw tile serves exactly the topics the
  // scene inventory can't render, so it is offered whenever the modal
  // has any source at all; its settings sidebar lists every topic.
  [MCAP_TILE_TYPE.RAW]: {
    typeLabel: "Message",
    icon: IconName.JSON,
    Tile: McapRawMessageTile,
    sourceTypes: Object.values(MCAP_SOURCE_TYPE),
  },
};

const TILE_TYPES = Object.keys(TILE_BY_TYPE) as readonly McapTileType[];

function isKnownTileType(type: string): type is McapTileType {
  return Object.hasOwn(TILE_BY_TYPE, type);
}

/**
 * Catalog lookup for layout restore: the component + label backing a
 * tile type, or `null` for unknown types (e.g. a persisted layout from
 * a build with more tile kinds).
 */
export function getMcapTileDefinition(type: string): {
  icon: IconName;
  typeLabel: string;
  Tile: React.ComponentType<McapTileProps>;
} | null {
  return isKnownTileType(type) ? TILE_BY_TYPE[type] : null;
}

/**
 * Tile types that can render at least one of the given scene-source
 * types, in catalog order. Drives tile registration, default layouts,
 * and persisted-layout validation.
 */
export function mcapTileTypesFor(
  sourceTypes: readonly string[],
): readonly McapTileType[] {
  return TILE_TYPES.filter((tileType) =>
    TILE_BY_TYPE[tileType].sourceTypes.some((sourceType) =>
      sourceTypes.includes(sourceType),
    ),
  );
}

/**
 * Registers every tile archetype so Add tile and Change panel type stay
 * type-first; each new instance discovers its sources through the scene
 * inventory, and individual tile settings handle empty/missing sources.
 */
export function useMcapTiles(): void {
  const { registerTile } = useTileRegistry();
  const tileTypes = TILE_TYPES;

  useEffect(() => {
    const cleanups = tileTypes.map((type) => {
      const entry = TILE_BY_TYPE[type];
      return registerTile({
        type,
        typeLabel: entry.typeLabel,
        icon: entry.icon,
        Tile: entry.Tile,
      });
    });
    return () => cleanups.forEach((c) => c());
  }, [tileTypes, registerTile]);
}
