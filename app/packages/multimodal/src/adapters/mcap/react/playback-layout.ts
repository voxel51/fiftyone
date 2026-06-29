import { autoLayout } from "@fiftyone/tiling";
import type { MosaicNode } from "react-mosaic-component";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceReadProfile,
} from "../../../query/bytes";
import type { SceneSource } from "../../../scene-inventory";
import { MCAP_SOURCE_TYPE } from "../scene-sources";
import { MCAP_TILE_TYPE, type McapTileType } from "./mcap-tile-types";

/**
 * Hard ceiling on default image tiles. Beyond this, tiles get too small
 * to read and the decode worker spends more time context-switching than
 * rendering; extra sources stay one "Add tile" away.
 */
export const MAX_DEFAULT_IMAGE_TILES = 6;

// Smallest tile footprint that still reads as a useful video feed.
const MIN_IMAGE_TILE_WIDTH_PX = 400;
const MIN_IMAGE_TILE_HEIGHT_PX = 240;

// Capability assumptions when the browser won't say. Deliberately
// middle-of-the-road: a wrong guess costs one tile too many/few, and
// the user's own arrangement persists over these defaults anyway.
const DEFAULT_CPU_CORES = 4;
const DEFAULT_VIEWPORT_WIDTH_PX = 1280;
const DEFAULT_VIEWPORT_HEIGHT_PX = 800;

// Share of the modal width the image grid keeps when a 3D tile sits
// beside it.
const IMAGE_REGION_SPLIT_PERCENTAGE = 62;

// Mosaic leaf id of the single default 3D tile.
const THREE_D_TILE_ID = `${MCAP_TILE_TYPE.THREE_D}-1`;

/**
 * Device/runtime signals the layout resolver weighs. Collected once per
 * modal open via {@link collectPlaybackDeviceCapabilities}; injectable
 * for tests and future overrides.
 */
export interface PlaybackDeviceCapabilities {
  /** Logical CPU cores (`navigator.hardwareConcurrency`). */
  readonly cpuCores: number;
  /** Device memory in GB (`navigator.deviceMemory`, Chromium only). */
  readonly memoryGb: number | null;
  /** Network downlink estimate in Mbps (`navigator.connection`). */
  readonly networkDownlinkMbps: number | null;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

/**
 * One tile the resolver wants in the default workspace.
 */
export interface PlaybackLayoutTile {
  /** Mosaic leaf id, `${tileType}-${n}` so the tiling id parser works. */
  readonly id: string;
  readonly tileType: McapTileType;
  /** Source the tile should open bound to; image tiles only. */
  readonly initialSourceId?: string;
  /** Initial tile title (the source label for image tiles). */
  readonly title: string;
}

/**
 * Resolver output: the default tile set and a deliberate mosaic
 * arrangement for it.
 */
export interface ResolvedPlaybackLayout {
  readonly tiles: readonly PlaybackLayoutTile[];
  readonly layout: MosaicNode<string> | undefined;
}

/**
 * Reads the runtime capability signals the resolver weighs. Guarded for
 * non-browser environments; unknown signals stay null so the heuristics
 * can treat "unknown" differently from "weak".
 */
export function collectPlaybackDeviceCapabilities(): PlaybackDeviceCapabilities {
  const nav =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as Navigator & {
          deviceMemory?: number;
          connection?: { downlink?: number };
        });
  const win = typeof window === "undefined" ? undefined : window;

  return {
    cpuCores: normalizePositive(nav?.hardwareConcurrency) ?? DEFAULT_CPU_CORES,
    memoryGb: normalizePositive(nav?.deviceMemory) ?? null,
    networkDownlinkMbps: normalizePositive(nav?.connection?.downlink) ?? null,
    viewportWidth:
      normalizePositive(win?.innerWidth) ?? DEFAULT_VIEWPORT_WIDTH_PX,
    viewportHeight:
      normalizePositive(win?.innerHeight) ?? DEFAULT_VIEWPORT_HEIGHT_PX,
  };
}

// Topic tokens that mark a non-color image representation. Only a
// tiebreak: a dense depth stream still outranks a single RGB keyframe.
const NON_COLOR_IMAGE_TOKENS = new Set(["depth", "disparity", "ir"]);

/**
 * Image sources ranked for tile binding: densest stream first
 * (`recordCount` descending — a video-rate feed outranks a topic that
 * carries a single keyframe), color before depth-like streams at equal
 * density, unknown counts last, inventory order as the stable tiebreak.
 */
export function rankImageSources(
  sources: readonly SceneSource[],
): readonly SceneSource[] {
  return sources
    .filter((source) => source.type === MCAP_SOURCE_TYPE.IMAGE)
    .map((source, index) => ({ index, source }))
    .sort((left, right) => {
      const leftCount = left.source.recordCount ?? -1;
      const rightCount = right.source.recordCount ?? -1;
      if (leftCount !== rightCount) {
        return rightCount - leftCount;
      }
      const leftDepth = isNonColorImageSource(left.source) ? 1 : 0;
      const rightDepth = isNonColorImageSource(right.source) ? 1 : 0;
      if (leftDepth !== rightDepth) {
        return leftDepth - rightDepth;
      }
      return left.index - right.index;
    })
    .map(({ source }) => source);
}

function isNonColorImageSource(source: SceneSource): boolean {
  return source.id
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => NON_COLOR_IMAGE_TOKENS.has(token));
}

/**
 * Decides the default playback workspace for a scene: how many image
 * tiles to open (bound to the densest sources) next to one fused 3D
 * tile.
 *
 * Heuristic budgets, all combined with `min` and clamped to the number
 * of image sources:
 *
 * - CPU: every visible stream costs continuous decode work on the
 *   shared worker; fewer cores → fewer tiles.
 * - Memory: per-topic frame caches (~hundreds of decoded frames each)
 *   dominate; little memory → fewer tiles. Unknown (non-Chromium)
 *   imposes no cap rather than guessing weak.
 * - Locality: remote sources pay range-request latency and bandwidth
 *   per stream; the downlink estimate widens or tightens the cap.
 * - Viewport: tiles below a readable size help nobody; the cap is how
 *   many minimum-size tiles physically fit the image region.
 */
export function resolvePlaybackLayout({
  capabilities,
  readProfile,
  sources,
}: {
  readonly capabilities: PlaybackDeviceCapabilities;
  readonly readProfile?: ByteSourceReadProfile;
  readonly sources: readonly SceneSource[];
}): ResolvedPlaybackLayout {
  const rankedImages = rankImageSources(sources);
  const has3d = sources.some(
    (source) => source.type === MCAP_SOURCE_TYPE.POINT_CLOUD,
  );

  const imageTileCount =
    rankedImages.length === 0
      ? 0
      : Math.min(
          rankedImages.length,
          imageTileBudget({ capabilities, has3d, readProfile }),
        );

  const tiles: PlaybackLayoutTile[] = rankedImages
    .slice(0, imageTileCount)
    .map((source, index) => ({
      id: `${MCAP_TILE_TYPE.IMAGE}-${index + 1}`,
      initialSourceId: source.id,
      tileType: MCAP_TILE_TYPE.IMAGE,
      title: source.label,
    }));
  if (has3d) {
    tiles.push({
      id: THREE_D_TILE_ID,
      tileType: MCAP_TILE_TYPE.THREE_D,
      title: "3D",
    });
  }

  return {
    layout: buildLayoutTree({ has3d, tiles }),
    tiles,
  };
}

function imageTileBudget({
  capabilities,
  has3d,
  readProfile,
}: {
  readonly capabilities: PlaybackDeviceCapabilities;
  readonly has3d: boolean;
  readonly readProfile?: ByteSourceReadProfile;
}): number {
  const cpuBudget =
    capabilities.cpuCores >= 12
      ? MAX_DEFAULT_IMAGE_TILES
      : capabilities.cpuCores >= 8
        ? 4
        : capabilities.cpuCores >= 4
          ? 3
          : 2;

  const memoryBudget =
    capabilities.memoryGb === null
      ? MAX_DEFAULT_IMAGE_TILES
      : capabilities.memoryGb >= 8
        ? MAX_DEFAULT_IMAGE_TILES
        : capabilities.memoryGb >= 4
          ? 4
          : 2;

  const localityBudget =
    readProfile === BYTE_SOURCE_READ_PROFILE.REMOTE
      ? remoteNetworkBudget(capabilities.networkDownlinkMbps)
      : MAX_DEFAULT_IMAGE_TILES;

  const imageRegionWidth =
    capabilities.viewportWidth *
    (has3d ? IMAGE_REGION_SPLIT_PERCENTAGE / 100 : 1);
  const viewportBudget = Math.max(
    1,
    Math.floor(imageRegionWidth / MIN_IMAGE_TILE_WIDTH_PX) *
      Math.max(
        1,
        Math.floor(capabilities.viewportHeight / MIN_IMAGE_TILE_HEIGHT_PX),
      ),
  );

  return Math.max(
    1,
    Math.min(
      MAX_DEFAULT_IMAGE_TILES,
      cpuBudget,
      memoryBudget,
      localityBudget,
      viewportBudget,
    ),
  );
}

function remoteNetworkBudget(downlinkMbps: number | null): number {
  if (downlinkMbps === null) {
    return 3;
  }
  if (downlinkMbps >= 100) {
    return 4;
  }
  if (downlinkMbps >= 25) {
    return 3;
  }
  return 2;
}

/**
 * Deliberate arrangement: image tiles in a balanced grid, the 3D tile
 * as a full-height column beside them.
 */
function buildLayoutTree({
  has3d,
  tiles,
}: {
  readonly has3d: boolean;
  readonly tiles: readonly PlaybackLayoutTile[];
}): MosaicNode<string> | undefined {
  const imageGrid = autoLayout(
    tiles
      .filter((tile) => tile.tileType === MCAP_TILE_TYPE.IMAGE)
      .map((tile) => tile.id),
  );

  if (!has3d) {
    return imageGrid ?? undefined;
  }
  if (imageGrid === null) {
    return THREE_D_TILE_ID;
  }

  return {
    direction: "row",
    first: imageGrid,
    second: THREE_D_TILE_ID,
    splitPercentage: IMAGE_REGION_SPLIT_PERCENTAGE,
  };
}

function normalizePositive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}
