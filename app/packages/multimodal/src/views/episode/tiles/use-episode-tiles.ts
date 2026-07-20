import { useTileRegistry } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect } from "react";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import Episode3dTile from "../scene/Episode3dTile";
import EpisodeImageTile from "../image/EpisodeImageTile";
import EpisodeLogConsoleTile from "../logs/EpisodeLogConsoleTile";
import EpisodeMapTile from "../map/EpisodeMapTile";
import EpisodePlotTile from "../plots/EpisodePlotTile";
import EpisodeRawMessageTile from "../raw/EpisodeRawMessageTile";
import {
  EPISODE_TILE_TYPE,
  type EpisodeTileProps,
  type EpisodeTileType,
} from "./episode-tile-types";

export { EPISODE_TILE_TYPE } from "./episode-tile-types";
export type { EpisodeTileProps, EpisodeTileType } from "./episode-tile-types";

/**
 * Tile catalog for the episode shell, keyed by tile type. A tile kind is
 * named for what it renders ("Image", "3D"), not for the sensor behind
 * it; `sourceTypes` lists the scene-source types the tile can display,
 * which gates when the kind is offered. Annotation sources render inside the
 * image or 3D tile that matches their dimensionality.
 */
const TILE_BY_TYPE: Record<
  EpisodeTileType,
  {
    typeLabel: string;
    icon: IconName;
    Tile: React.ComponentType<EpisodeTileProps>;
    sourceTypes: readonly string[];
  }
> = {
  [EPISODE_TILE_TYPE.IMAGE]: {
    typeLabel: "Image",
    icon: IconName.GridView,
    Tile: EpisodeImageTile,
    sourceTypes: [SCENE_SOURCE_TYPE.IMAGE],
  },
  [EPISODE_TILE_TYPE.LOG]: {
    typeLabel: "Logs",
    icon: IconName.Logs,
    Tile: EpisodeLogConsoleTile,
    sourceTypes: [SCENE_SOURCE_TYPE.LOG],
  },
  [EPISODE_TILE_TYPE.MAP]: {
    typeLabel: "Map",
    icon: IconName.Polyline,
    Tile: EpisodeMapTile,
    sourceTypes: [SCENE_SOURCE_TYPE.LOCATION],
  },
  [EPISODE_TILE_TYPE.THREE_D]: {
    typeLabel: "3D",
    icon: IconName.Embeddings,
    Tile: Episode3dTile,
    sourceTypes: [
      SCENE_SOURCE_TYPE.MAP_LAYER,
      SCENE_SOURCE_TYPE.POINT_CLOUD,
      SCENE_SOURCE_TYPE.POSE,
      SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
    ],
  },
  // Plottable streams are exactly the ones the scene inventory omits
  // (telemetry has no visualization), so the plot tile is offered
  // whenever the modal has any source at all; its settings sidebar
  // enumerates numeric fields independently of scene sources.
  [EPISODE_TILE_TYPE.PLOT]: {
    typeLabel: "Plot",
    icon: IconName.Insights,
    Tile: EpisodePlotTile,
    sourceTypes: Object.values(SCENE_SOURCE_TYPE),
  },
  // Like the plot tile, the raw tile serves exactly the streams the
  // scene inventory can't render, so it is offered whenever the modal
  // has any source at all; its settings sidebar lists every stream.
  [EPISODE_TILE_TYPE.RAW]: {
    typeLabel: "Message",
    icon: IconName.JSON,
    Tile: EpisodeRawMessageTile,
    sourceTypes: Object.values(SCENE_SOURCE_TYPE),
  },
};

const TILE_TYPES = Object.keys(TILE_BY_TYPE) as readonly EpisodeTileType[];

function isKnownTileType(type: string): type is EpisodeTileType {
  return Object.hasOwn(TILE_BY_TYPE, type);
}

/**
 * Catalog lookup for layout restore: the component + label backing a
 * tile type, or `null` for unknown types (e.g. a persisted layout from
 * a build with more tile kinds).
 */
export function getEpisodeTileDefinition(type: string): {
  icon: IconName;
  typeLabel: string;
  Tile: React.ComponentType<EpisodeTileProps>;
} | null {
  return isKnownTileType(type) ? TILE_BY_TYPE[type] : null;
}

/**
 * Tile types that can render at least one of the given scene-source
 * types, in catalog order. Drives tile registration, default layouts,
 * and persisted-layout validation.
 */
export function episodeTileTypesFor(
  sourceTypes: readonly string[],
): readonly EpisodeTileType[] {
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
export function useEpisodeTiles(): void {
  const { registerTile } = useTileRegistry();
  const tileTypes = TILE_TYPES;

  // This effect registers the episode tile catalog for the lifetime of the
  // containing episode view.
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
