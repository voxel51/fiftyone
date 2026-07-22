import type { EpisodeTileExtensionId } from "../../../extensions/tiles/types";

/**
 * Tile kinds the episode shell can render. A tile kind is named for what
 * it shows ("image", "3d"), not for the sensor behind it. The same
 * values are stored on tiling entries and prefix persisted episode mosaic
 * leaf ids (`image-1`, `3d-1`) — see `tileTypeFromId` in
 * layout-persistence.
 *
 * Kept in a leaf module (no imports) so the tile catalog, the layout
 * resolver, and the tile bodies can all share it without cycles.
 */
export const TILE_TYPE = {
  IMAGE: "image",
  LOG: "log",
  MAP: "map",
  PLOT: "plot",
  RAW: "raw",
  THREE_D: "3d",
} as const;

/** Tile kinds supplied eagerly by the core multimodal package. */
export type BuiltInTileType = (typeof TILE_TYPE)[keyof typeof TILE_TYPE];

export type {
  EpisodeTileProps,
  EpisodeTileExtensionId,
} from "../../../extensions/tiles/types";

/** Any tile kind available to the episode host in the current build. */
export type TileType = BuiltInTileType | EpisodeTileExtensionId;
