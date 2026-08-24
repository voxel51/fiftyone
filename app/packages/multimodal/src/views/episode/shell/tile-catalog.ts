import {
  EmbeddingsIcon,
  GridViewIcon,
  type IconProps,
  InsightsIcon,
  JSONIcon,
  LogsIcon,
  PolylineIcon,
  WorkspacesIcon,
} from "@voxel51/voodo";
import {
  getEpisodeTileExtension,
  getEpisodeTileExtensions,
} from "../../../extensions/tiles/registry";
import type { EpisodeTileAvailability } from "../../../extensions/tiles/types";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import AudioTile from "../audio/AudioTile";
import Scene3dTile from "../scene/tile/Scene3dTile";
import ImageTile from "../image/ImageTile";
import LogConsoleTile from "../logs/LogConsoleTile";
import MapTile from "../map/tile/MapTile";
import PlotTile from "../plots/PlotTile";
import RawMessageTile from "../raw/RawMessageTile";
import TransformGraphTile from "../transforms/TransformGraphTile";
import {
  TILE_TYPE,
  type BuiltInTileType,
  type EpisodeTileProps,
  type TileType,
} from "../tiles/tile-types";

export type { EpisodeTileProps, TileType } from "../tiles/tile-types";
export type { EpisodeTileAvailability } from "../../../extensions/tiles/types";

interface TileDefinition {
  readonly icon: React.ComponentType<IconProps>;
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
const BUILT_IN_TILE_BY_TYPE: Record<BuiltInTileType, TileDefinition> = {
  [TILE_TYPE.AUDIO]: {
    icon: IconName.VolumeUp,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.AUDIO),
    order: 15,
    Tile: AudioTile,
    typeLabel: "Audio",
  },
  [TILE_TYPE.IMAGE]: {
    icon: GridViewIcon,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.IMAGE),
    order: 10,
    Tile: ImageTile,
    typeLabel: "Image",
  },
  [TILE_TYPE.LOG]: {
    icon: LogsIcon,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.LOG),
    order: 40,
    Tile: LogConsoleTile,
    typeLabel: "Logs",
  },
  [TILE_TYPE.MAP]: {
    icon: PolylineIcon,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.includes(SCENE_SOURCE_TYPE.LOCATION),
    order: 30,
    Tile: MapTile,
    typeLabel: "Map",
  },
  [TILE_TYPE.THREE_D]: {
    icon: EmbeddingsIcon,
    isAvailable: ({ sourceTypes }) =>
      sourceTypes.some((sourceType) => THREE_D_SOURCE_TYPES.has(sourceType)),
    order: 20,
    Tile: Scene3dTile,
    typeLabel: "3D",
  },
  [TILE_TYPE.PLOT]: {
    icon: InsightsIcon,
    isAvailable: ({ hasNumericSeries }) => hasNumericSeries,
    order: 50,
    Tile: PlotTile,
    typeLabel: "Plot",
  },
  [TILE_TYPE.TRANSFORMS]: {
    icon: WorkspacesIcon,
    isAvailable: ({ hasTransformTopology }) => hasTransformTopology,
    order: 55,
    Tile: TransformGraphTile,
    typeLabel: "Transforms",
  },
  [TILE_TYPE.RAW]: {
    icon: JSONIcon,
    isAvailable: ({ hasRawRecords }) => hasRawRecords,
    order: 60,
    Tile: RawMessageTile,
    typeLabel: "Message",
  },
};

const BUILT_IN_TILE_TYPES = Object.keys(
  BUILT_IN_TILE_BY_TYPE,
) as BuiltInTileType[];

function isBuiltInTileType(type: string): type is BuiltInTileType {
  return Object.hasOwn(BUILT_IN_TILE_BY_TYPE, type);
}

/**
 * Catalog lookup for layout restore: the component + label backing a
 * tile type, or `null` for unknown types (e.g. a persisted layout from
 * a build with more tile kinds).
 */
export function getTileDefinition(type: string): {
  icon: React.ComponentType<IconProps>;
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
export function tileTypesFor(
  facts: EpisodeTileAvailability,
): readonly TileType[] {
  const definitions: readonly (TileDefinition & {
    readonly id: TileType;
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
