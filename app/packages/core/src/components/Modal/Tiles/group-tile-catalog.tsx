import type { RegisteredTile, TilingTile } from "@fiftyone/tiling";
import { IconName } from "@voxel51/voodo";
import type { ComponentType } from "react";
import type { MosaicNode } from "react-mosaic-component";
import { CarouselTile } from "./tiles/CarouselTile";
import { MediaTile } from "./tiles/MediaTile";
import { SampleTile } from "./tiles/SampleTile";
import { ThreeDTile } from "./tiles/ThreeDTile";
import {
  GROUP_TILE_TYPE,
  GROUP_TILE_TYPES,
  defaultGroupTileId,
  isGroupTileType,
  type GroupTileType,
} from "./tile-types";

/** What the current dataset/group makes available, read from app state. */
export interface GroupTileFacts {
  /** Dynamic group: the existing paginated tree is hosted as one tile. */
  readonly dynamic: boolean;
  /** At least one slice is a 3D media type. */
  readonly has3dSlice: boolean;
  /** Every slice is 3D, so there is no 2D media to show. */
  readonly only3d: boolean;
  /** A 2D viewer makes sense (no 3D, or mixed media types). */
  readonly mediaAvailable: boolean;
  /**
   * Seeds for the default layout, from the legacy visibility settings so a
   * user's previous hide/show choices carry over on first open.
   */
  readonly seedVisible: Readonly<Record<GroupTileType, boolean>>;
}

interface GroupTileDefinition {
  readonly icon: IconName;
  readonly isAvailable: (facts: GroupTileFacts) => boolean;
  readonly Tile: ComponentType;
  readonly typeLabel: string;
}

const CATALOG: Record<GroupTileType, GroupTileDefinition> = {
  [GROUP_TILE_TYPE.CAROUSEL]: {
    icon: IconName.GridView,
    isAvailable: ({ dynamic, only3d }) => !dynamic && !only3d,
    Tile: CarouselTile,
    typeLabel: "Carousel",
  },
  [GROUP_TILE_TYPE.MEDIA]: {
    icon: IconName.ImageSearch,
    isAvailable: ({ dynamic, mediaAvailable }) => !dynamic && mediaAvailable,
    Tile: MediaTile,
    typeLabel: "Media",
  },
  [GROUP_TILE_TYPE.THREE_D]: {
    icon: IconName.Embeddings,
    isAvailable: ({ dynamic, has3dSlice }) => !dynamic && has3dSlice,
    Tile: ThreeDTile,
    typeLabel: "3D",
  },
  [GROUP_TILE_TYPE.SAMPLE]: {
    icon: IconName.Inspect,
    isAvailable: ({ dynamic }) => dynamic,
    Tile: SampleTile,
    typeLabel: "Sample",
  },
};

export function getGroupTileDefinition(
  type: string,
): GroupTileDefinition | null {
  return isGroupTileType(type) ? CATALOG[type] : null;
}

export function availableGroupTileTypes(
  facts: GroupTileFacts,
): GroupTileType[] {
  return GROUP_TILE_TYPES.filter((type) => CATALOG[type].isAvailable(facts));
}

/** Registry entries for the Layout menu, change-type and restore paths. */
export function registeredGroupTiles(facts: GroupTileFacts): RegisteredTile[] {
  return availableGroupTileTypes(facts).map((type) => {
    const { icon, Tile, typeLabel } = CATALOG[type];
    return { type, typeLabel, icon, Tile };
  });
}

/** Materialize one tile entry of a known kind. */
export function createGroupTile(type: GroupTileType): TilingTile {
  const { Tile, typeLabel } = CATALOG[type];
  return { type, title: typeLabel, render: () => <Tile /> };
}

export interface ResolvedGroupLayout {
  readonly tiles: Record<string, TilingTile>;
  readonly layout: MosaicNode<string> | null;
}

/**
 * The built-in arrangement, mirroring today's split view: carousel above
 * media on the left, 3D on the right when a 3D slice exists. Dynamic
 * groups are one sample tile. Kinds the user had hidden through the legacy
 * visibility popout are left out, unless that would leave nothing.
 */
export function defaultGroupLayout(facts: GroupTileFacts): ResolvedGroupLayout {
  const available = availableGroupTileTypes(facts);
  let shown = available.filter((type) => facts.seedVisible[type]);
  if (shown.length === 0) {
    shown = available;
  }

  const tiles: Record<string, TilingTile> = {};
  for (const type of shown) {
    tiles[defaultGroupTileId(type)] = createGroupTile(type);
  }

  const id = (type: GroupTileType) =>
    shown.includes(type) ? defaultGroupTileId(type) : null;
  const carousel = id(GROUP_TILE_TYPE.CAROUSEL);
  const media = id(GROUP_TILE_TYPE.MEDIA);
  const threeD = id(GROUP_TILE_TYPE.THREE_D);
  const sample = id(GROUP_TILE_TYPE.SAMPLE);

  if (sample) {
    return { tiles, layout: sample };
  }

  let left: MosaicNode<string> | null = null;
  if (carousel && media) {
    left = {
      direction: "column",
      first: carousel,
      second: media,
      splitPercentage: 30,
    };
  } else {
    left = carousel ?? media;
  }

  let layout: MosaicNode<string> | null = left;
  if (threeD) {
    layout = left
      ? { direction: "row", first: left, second: threeD, splitPercentage: 60 }
      : threeD;
  }

  return { tiles, layout };
}
