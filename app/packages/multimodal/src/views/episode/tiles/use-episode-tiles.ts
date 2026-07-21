import { useTileRegistry } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import { useEffect } from "react";
import {
  getEpisodeTileExtension,
  getEpisodeTileExtensions,
} from "../../../extensions/tiles/registry";
import type { EpisodeTileAvailability } from "../../../extensions/tiles/types";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import Episode3dTile from "../scene/Episode3dTile";
import EpisodeImageTile from "../image/EpisodeImageTile";
import EpisodeLogConsoleTile from "../logs/EpisodeLogConsoleTile";
import EpisodeMapTile from "../map/EpisodeMapTile";
import EpisodePlotTile from "../plots/EpisodePlotTile";
import EpisodeRawMessageTile from "../raw/EpisodeRawMessageTile";
import {
  EPISODE_TILE_TYPE,
  type BuiltInEpisodeTileType,
  type EpisodeTileProps,
  type EpisodeTileType,
} from "./episode-tile-types";

export { EPISODE_TILE_TYPE } from "./episode-tile-types";
export type { EpisodeTileProps, EpisodeTileType } from "./episode-tile-types";
export type { EpisodeTileAvailability } from "../../../extensions/tiles/types";

interface EpisodeTileDefinition {
  readonly icon: IconName;
  readonly isAvailable: (facts: EpisodeTileAvailability) => boolean;
  readonly order: number;
  readonly Tile: React.ComponentType<EpisodeTileProps>;
  readonly typeLabel: string;
}

const THREE_D_SOURCE_TYPES = new Set<string>([
  SCENE_SOURCE_TYPE.MAP_LAYER,
  SCENE_SOURCE_TYPE.POINT_CLOUD,
  SCENE_SOURCE_TYPE.POSE,
  SCENE_SOURCE_TYPE.SCENE_ANNOTATION,
]);

/** Built-in tile catalog in explicit product order. */
const BUILT_IN_TILE_BY_TYPE: Record<
  BuiltInEpisodeTileType,
  EpisodeTileDefinition
> = {
  [EPISODE_TILE_TYPE.IMAGE]: {
    icon: IconName.GridView,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.IMAGE),
    order: 10,
    Tile: EpisodeImageTile,
    typeLabel: "Image",
  },
  [EPISODE_TILE_TYPE.LOG]: {
    icon: IconName.Logs,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.LOG),
    order: 40,
    Tile: EpisodeLogConsoleTile,
    typeLabel: "Logs",
  },
  [EPISODE_TILE_TYPE.MAP]: {
    icon: IconName.Polyline,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.LOCATION),
    order: 30,
    Tile: EpisodeMapTile,
    typeLabel: "Map",
  },
  [EPISODE_TILE_TYPE.THREE_D]: {
    icon: IconName.Embeddings,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.some((sourceType) => THREE_D_SOURCE_TYPES.has(sourceType)),
    order: 20,
    Tile: Episode3dTile,
    typeLabel: "3D",
  },
  [EPISODE_TILE_TYPE.PLOT]: {
    icon: IconName.Insights,
    isAvailable: ({ hasNumericSeries }) => hasNumericSeries,
    order: 50,
    Tile: EpisodePlotTile,
    typeLabel: "Plot",
  },
  [EPISODE_TILE_TYPE.RAW]: {
    icon: IconName.JSON,
    isAvailable: ({ hasRawRecords }) => hasRawRecords,
    order: 60,
    Tile: EpisodeRawMessageTile,
    typeLabel: "Message",
  },
};

const BUILT_IN_TILE_TYPES = Object.keys(
  BUILT_IN_TILE_BY_TYPE,
) as BuiltInEpisodeTileType[];

function isBuiltInTileType(type: string): type is BuiltInEpisodeTileType {
  return Object.hasOwn(BUILT_IN_TILE_BY_TYPE, type);
}

/**
 * Catalog lookup for layout restore: the component + label backing a
 * tile type, or `null` for unknown types (e.g. a persisted layout from
 * a build with more tile kinds).
 */
export function getEpisodeTileDefinition(type: string): {
  icon: IconName;
  order: number;
  typeLabel: string;
  Tile: React.ComponentType<EpisodeTileProps>;
} | null {
  return isBuiltInTileType(type)
    ? BUILT_IN_TILE_BY_TYPE[type]
    : getEpisodeTileExtension(type);
}

/**
 * Tile kinds supported by the current episode, in explicit product order.
 * Build-time contributions share the same availability and ordering policy.
 */
export function episodeTileTypesFor(
  facts: EpisodeTileAvailability,
): readonly EpisodeTileType[] {
  const definitions: readonly (EpisodeTileDefinition & {
    readonly id: EpisodeTileType;
  })[] = [
    ...BUILT_IN_TILE_TYPES.map((id) => ({
      ...BUILT_IN_TILE_BY_TYPE[id],
      id,
    })),
    ...getEpisodeTileExtensions(),
  ];
  return definitions
    .filter((definition) => definition.isAvailable(facts))
    .sort(
      (left, right) =>
        left.order - right.order || left.id.localeCompare(right.id),
    )
    .map(({ id }) => id);
}

/**
 * Registers every tile archetype so Add tile and Change panel type stay
 * type-first; each new instance discovers its sources through the scene
 * inventory, and individual tile settings handle empty/missing sources.
 */
export function useEpisodeTiles(tileTypes: readonly EpisodeTileType[]): void {
  const { registerTile } = useTileRegistry();

  // This effect registers the episode tile catalog for the lifetime of the
  // containing episode view.
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
    return () => cleanups.forEach((c) => c());
  }, [tileTypes, registerTile]);
}
