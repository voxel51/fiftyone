import { autoLayout, type TilingLayoutMetrics } from "@fiftyone/tiling";
import type { MosaicNode } from "react-mosaic-component";
import {
  BYTE_SOURCE_READ_PROFILE,
  type ByteSourceReadProfile,
} from "../../../ir";
import type { SceneSource } from "../../../scene-inventory";
import { SCENE_SOURCE_TYPE } from "../../../ir";
import { filterDefaultStreamEquivalents } from "../../../stream-selection";
import { tileTypeFromId } from "./layout-persistence";
import { TILE_TYPE, type TileType } from "../tiles/tile-types";

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

const THREE_D_WITH_MAP_SPLIT_PERCENTAGE = 70;
const MESSAGE_RAIL_SPLIT_PERCENTAGE = 75;
const VISUAL_WITH_PLOTS_SPLIT_PERCENTAGE = 70;
const CONTEXT_SHELF_IMAGE_SPLIT_PERCENTAGE = 65;
const DEFAULT_IMAGE_ASPECT_RATIO = 16 / 9;
const DEFAULT_IMAGE_BANK_ASPECT_RATIO = 16 / 9;
const DEFAULT_CONTEXT_SHELF_HEIGHT_FRACTION = 1 / 3;
const MIN_CONTEXT_SHELF_HEIGHT_FRACTION = 0.2;
const MAX_CONTEXT_SHELF_HEIGHT_FRACTION = 0.4;

// Mosaic leaf id of the single default 3D tile.
const THREE_D_TILE_ID = `${TILE_TYPE.THREE_D}-1`;
const LOG_TILE_ID = `${TILE_TYPE.LOG}-1`;

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
  readonly tileType: TileType;
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

// Stream tokens that mark a non-color image representation. Only a
// tiebreak: a dense depth stream still outranks a single RGB keyframe.
const NON_COLOR_IMAGE_TOKENS = new Set(["depth", "disparity", "ir"]);

/**
 * Image sources ranked for tile binding: densest stream first
 * (`recordCount` descending — a video-rate feed outranks a stream that
 * carries a single keyframe), color before depth-like streams at equal
 * density, unknown counts last, inventory order as the stable tiebreak.
 */
export function rankImageSources(
  sources: readonly SceneSource[],
): readonly SceneSource[] {
  return sources
    .filter((source) => source.type === SCENE_SOURCE_TYPE.IMAGE)
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

/**
 * Image sources used for automatic activation: dense-stream ranking with
 * raw/base equivalents suppressed when a downsampled/compressed sibling exists.
 */
export function rankDefaultImageSources(
  sources: readonly SceneSource[],
): readonly SceneSource[] {
  return filterDefaultStreamEquivalents(rankImageSources(sources), {
    getKind: (source) => source.type,
    getSourceName: (source) => source.sourceName,
  });
}

function isNonColorImageSource(source: SceneSource): boolean {
  return source.sourceName
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .some((token) => NON_COLOR_IMAGE_TOKENS.has(token));
}

/**
 * Decides the default playback workspace for a scene: how many image
 * tiles to open (bound to default-preferred sources) next to one fused
 * 3D tile.
 *
 * Heuristic budgets, all combined with `min` and clamped to the number
 * of image sources:
 *
 * - CPU: every visible stream costs continuous decode work on the
 *   shared worker; fewer cores → fewer tiles.
 * - Memory: per-stream frame caches (~hundreds of decoded frames each)
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
  const rankedImages = rankDefaultImageSources(sources);
  const has3d = sources.some(
    (source) =>
      source.type === SCENE_SOURCE_TYPE.POINT_CLOUD ||
      source.type === SCENE_SOURCE_TYPE.SCENE_ANNOTATION ||
      source.type === SCENE_SOURCE_TYPE.MAP_LAYER ||
      source.type === SCENE_SOURCE_TYPE.POSE,
  );
  const hasLogs = sources.some(
    (source) => source.type === SCENE_SOURCE_TYPE.LOG,
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
      id: `${TILE_TYPE.IMAGE}-${index + 1}`,
      initialSourceId: source.id,
      tileType: TILE_TYPE.IMAGE,
      title: source.label,
    }));
  if (has3d) {
    tiles.push({
      id: THREE_D_TILE_ID,
      tileType: TILE_TYPE.THREE_D,
      title: "3D",
    });
  }
  if (hasLogs) {
    tiles.push({
      id: LOG_TILE_ID,
      tileType: TILE_TYPE.LOG,
      title: "Logs",
    });
  }

  return {
    layout: buildLayoutTree(tiles, capabilities),
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

  const imageRegionWidth = capabilities.viewportWidth;
  const imageRegionHeight =
    capabilities.viewportHeight *
    (has3d ? MAX_CONTEXT_SHELF_HEIGHT_FRACTION : 1);
  const viewportBudget = Math.max(
    1,
    Math.floor(imageRegionWidth / MIN_IMAGE_TILE_WIDTH_PX) *
      Math.max(1, Math.floor(imageRegionHeight / MIN_IMAGE_TILE_HEIGHT_PX)),
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
 * Customer-oriented episode arrangement:
 *
 * - images stay co-located as a camera bank
 * - 3D and map tiles share the top visual region when both are present
 * - the supporting shelf hugs its image rows between 20–40% of the mosaic;
 *   3D receives the remainder
 * - plots stack as time-series diagnostics
 * - raw/message tiles stack as a right inspection rail
 * - unknown tile ids fall into diagnostics after known groups
 */
export function buildAutoLayout(
  tileIds: readonly string[],
  imageAspectRatios: Readonly<Record<string, number>> = {},
  geometry: number | TilingLayoutMetrics = DEFAULT_VIEWPORT_WIDTH_PX /
    DEFAULT_VIEWPORT_HEIGHT_PX,
): MosaicNode<string> | null {
  const layoutMetrics = typeof geometry === "number" ? null : geometry;
  const viewportAspectRatio =
    typeof geometry === "number" ? geometry : geometry.width / geometry.height;
  const effectiveViewportAspectRatio =
    normalizePositive(viewportAspectRatio) ??
    DEFAULT_VIEWPORT_WIDTH_PX / DEFAULT_VIEWPORT_HEIGHT_PX;
  const images: string[] = [];
  const threeD: string[] = [];
  const maps: string[] = [];
  const plots: string[] = [];
  const logs: string[] = [];
  const messages: string[] = [];
  const unknown: string[] = [];

  for (const tileId of tileIds) {
    switch (tileTypeFromId(tileId)) {
      case TILE_TYPE.IMAGE:
        images.push(tileId);
        break;
      case TILE_TYPE.THREE_D:
        threeD.push(tileId);
        break;
      case TILE_TYPE.MAP:
        maps.push(tileId);
        break;
      case TILE_TYPE.PLOT:
        plots.push(tileId);
        break;
      case TILE_TYPE.LOG:
        logs.push(tileId);
        break;
      case TILE_TYPE.RAW:
        messages.push(tileId);
        break;
      default:
        unknown.push(tileId);
        break;
    }
  }

  const topVisualRegion =
    threeD.length > 0 ? buildTopVisualRegion(threeD, maps) : null;
  const supportingRegion = topVisualRegion
    ? buildContextShelf(
        images,
        plots,
        logs,
        messages,
        unknown,
        imageAspectRatios,
        effectiveViewportAspectRatio,
        layoutMetrics,
      )
    : null;

  if (topVisualRegion) {
    if (!supportingRegion) {
      return topVisualRegion;
    }

    return {
      direction: "column",
      first: topVisualRegion,
      second: supportingRegion.layout,
      splitPercentage: 100 * (1 - supportingRegion.preferredHeightFraction),
    };
  }

  return buildNon3dLayout(
    images,
    maps,
    plots,
    logs,
    messages,
    unknown,
    imageAspectRatios,
  );
}

function buildNon3dLayout(
  images: readonly string[],
  maps: readonly string[],
  plots: readonly string[],
  logs: readonly string[],
  messages: readonly string[],
  unknown: readonly string[],
  imageAspectRatios: Readonly<Record<string, number>>,
): MosaicNode<string> | null {
  const imageBank = buildImageBank(images, imageAspectRatios);
  const mapBank = autoLayout([...maps]);
  const visualBank = stackNodes([imageBank, mapBank], {
    direction: "row",
    splitPercentage: CONTEXT_SHELF_IMAGE_SPLIT_PERCENTAGE,
  });
  const diagnostics = buildDiagnosticsStack(plots, logs, unknown);
  const left = stackNodes([visualBank, diagnostics], {
    direction: "column",
    splitPercentage: VISUAL_WITH_PLOTS_SPLIT_PERCENTAGE,
  });
  const messageRail = stackTiles(messages, "column");

  if (!messageRail) {
    return left;
  }
  if (!left) {
    return messageRail;
  }

  return {
    direction: "row",
    first: left,
    second: messageRail,
    splitPercentage: MESSAGE_RAIL_SPLIT_PERCENTAGE,
  };
}

function buildTopVisualRegion(
  threeD: readonly string[],
  maps: readonly string[],
): MosaicNode<string> | null {
  return stackNodes([autoLayout([...threeD]), autoLayout([...maps])], {
    direction: "row",
    splitPercentage: THREE_D_WITH_MAP_SPLIT_PERCENTAGE,
  });
}

function buildContextShelf(
  images: readonly string[],
  plots: readonly string[],
  logs: readonly string[],
  messages: readonly string[],
  unknown: readonly string[],
  imageAspectRatios: Readonly<Record<string, number>>,
  viewportAspectRatio: number,
  layoutMetrics: TilingLayoutMetrics | null,
): {
  readonly layout: MosaicNode<string>;
  readonly preferredHeightFraction: number;
} | null {
  const diagnostics = buildDiagnosticsStack(plots, logs, unknown);
  const messageRail = stackTiles(messages, "column");
  const imageWidthFraction =
    (diagnostics ? CONTEXT_SHELF_IMAGE_SPLIT_PERCENTAGE / 100 : 1) *
    (messageRail ? MESSAGE_RAIL_SPLIT_PERCENTAGE / 100 : 1);
  const targetImageBankAspectRatio =
    (viewportAspectRatio * imageWidthFraction) /
    MIN_CONTEXT_SHELF_HEIGHT_FRACTION;
  const imageBank = buildImageBankLayout(
    images,
    imageAspectRatios,
    targetImageBankAspectRatio,
    layoutMetrics
      ? {
          rowWidth: layoutMetrics.width * imageWidthFraction,
          tileHorizontalInset: layoutMetrics.tileHorizontalInset,
          tileVerticalInset: layoutMetrics.tileVerticalInset,
        }
      : undefined,
  );
  const left = stackNodes([imageBank?.layout ?? null, diagnostics], {
    direction: "row",
    splitPercentage: CONTEXT_SHELF_IMAGE_SPLIT_PERCENTAGE,
  });
  const preferredHeightFraction = clamp(
    preferredContextShelfHeightFraction(
      imageBank,
      viewportAspectRatio,
      imageWidthFraction,
      layoutMetrics,
    ),
    MIN_CONTEXT_SHELF_HEIGHT_FRACTION,
    MAX_CONTEXT_SHELF_HEIGHT_FRACTION,
  );

  if (!messageRail) {
    return left ? { layout: left, preferredHeightFraction } : null;
  }
  if (!left) {
    return { layout: messageRail, preferredHeightFraction };
  }

  return {
    layout: {
      direction: "row",
      first: left,
      second: messageRail,
      splitPercentage: MESSAGE_RAIL_SPLIT_PERCENTAGE,
    },
    preferredHeightFraction,
  };
}

function preferredContextShelfHeightFraction(
  imageBank: {
    readonly aspectRatio: number;
    readonly preferredHeightPx?: number;
  } | null,
  viewportAspectRatio: number,
  imageWidthFraction: number,
  layoutMetrics: TilingLayoutMetrics | null,
): number {
  if (!imageBank) {
    return DEFAULT_CONTEXT_SHELF_HEIGHT_FRACTION;
  }
  if (layoutMetrics && imageBank.preferredHeightPx !== undefined) {
    return imageBank.preferredHeightPx / layoutMetrics.height;
  }
  return (viewportAspectRatio * imageWidthFraction) / imageBank.aspectRatio;
}

function buildImageBankLayout(
  tileIds: readonly string[],
  aspectRatios: Readonly<Record<string, number>>,
  targetAspectRatio: number,
  sizing?: {
    readonly rowWidth: number;
    readonly tileHorizontalInset: number;
    readonly tileVerticalInset: number;
  },
): {
  readonly layout: MosaicNode<string>;
  readonly aspectRatio: number;
  readonly preferredHeightPx?: number;
} | null {
  if (tileIds.length === 0) return null;

  const ratios = tileIds.map(
    (tileId) =>
      normalizePositive(aspectRatios[tileId]) ?? DEFAULT_IMAGE_ASPECT_RATIO,
  );
  const rows = bestImageRows(ratios, targetAspectRatio);
  const rowAspects = rows.map(([start, end]) =>
    ratios.slice(start, end).reduce((sum, ratio) => sum + ratio, 0),
  );
  const rowTileCounts = rows.map(([start, end]) => end - start);
  const rowHeights = rowAspects.map((rowAspect, index) =>
    sizing
      ? Math.max(
          1,
          sizing.rowWidth - sizing.tileHorizontalInset * rowTileCounts[index],
        ) /
          rowAspect +
        sizing.tileVerticalInset
      : 1 / rowAspect,
  );
  const rowNodes = rows.map(([start, end]) => {
    const rowRatios = ratios.slice(start, end);
    return buildWeightedRow(
      tileIds.slice(start, end),
      sizing
        ? imageRowOuterWidths(
            rowRatios,
            sizing.rowWidth,
            sizing.tileHorizontalInset,
          )
        : rowRatios,
    );
  });

  return {
    aspectRatio: combinedRowAspectRatio(rowAspects),
    layout: buildWeightedStack(rowNodes, rowHeights, "column"),
    ...(sizing
      ? {
          preferredHeightPx: rowHeights.reduce(
            (height, rowHeight) => height + rowHeight,
            0,
          ),
        }
      : {}),
  };
}

function imageRowOuterWidths(
  aspectRatios: readonly number[],
  rowWidth: number,
  tileHorizontalInset: number,
): readonly number[] {
  const totalAspectRatio = aspectRatios.reduce((sum, ratio) => sum + ratio, 0);
  const contentWidth = rowWidth - tileHorizontalInset * aspectRatios.length;
  if (!(contentWidth > 0)) return aspectRatios;
  const contentHeight = contentWidth / totalAspectRatio;
  return aspectRatios.map(
    (ratio) => ratio * contentHeight + tileHorizontalInset,
  );
}

function buildImageBank(
  images: readonly string[],
  imageAspectRatios: Readonly<Record<string, number>> = {},
  targetAspectRatio = DEFAULT_IMAGE_BANK_ASPECT_RATIO,
): MosaicNode<string> | null {
  return (
    buildImageBankLayout(images, imageAspectRatios, targetAspectRatio)
      ?.layout ?? null
  );
}

function bestImageRows(
  ratios: readonly number[],
  targetAspectRatio: number,
): Array<readonly [number, number]> {
  let bestRows: Array<readonly [number, number]> = [[0, ratios.length]];
  let bestScore = Number.POSITIVE_INFINITY;
  for (let rowCount = 1; rowCount <= ratios.length; rowCount++) {
    const rows = balancedImageRows(ratios, rowCount);
    const rowAspects = rows.map(([rowStart, rowEnd]) =>
      ratios.slice(rowStart, rowEnd).reduce((sum, ratio) => sum + ratio, 0),
    );
    const layoutAspect = combinedRowAspectRatio(rowAspects);
    const score = Math.abs(Math.log(layoutAspect / targetAspectRatio));
    if (score < bestScore) {
      bestScore = score;
      bestRows = rows;
    }
  }

  return bestRows;
}

function balancedImageRows(
  ratios: readonly number[],
  rowCount: number,
): Array<readonly [number, number]> {
  const rows: Array<readonly [number, number]> = [];
  let start = 0;
  let remainingAspect = ratios.reduce((sum, ratio) => sum + ratio, 0);

  for (let row = 0; row < rowCount - 1; row++) {
    const remainingRows = rowCount - row;
    const targetRowAspect = remainingAspect / remainingRows;
    const latestEnd = ratios.length - (remainingRows - 1);
    let rowAspect = 0;
    let bestEnd = start + 1;
    let bestDifference = Number.POSITIVE_INFINITY;
    let selectedAspect = ratios[start];

    for (let end = start + 1; end <= latestEnd; end++) {
      rowAspect += ratios[end - 1];
      const difference = Math.abs(rowAspect - targetRowAspect);
      if (difference < bestDifference) {
        bestDifference = difference;
        bestEnd = end;
        selectedAspect = rowAspect;
      }
    }

    rows.push([start, bestEnd]);
    start = bestEnd;
    remainingAspect -= selectedAspect;
  }

  rows.push([start, ratios.length]);
  return rows;
}

function combinedRowAspectRatio(rowAspects: readonly number[]): number {
  return 1 / rowAspects.reduce((sum, row) => sum + 1 / row, 0);
}

function buildWeightedRow(
  tileIds: readonly string[],
  widths: readonly number[],
): MosaicNode<string> {
  return buildWeightedStack(tileIds, widths, "row");
}

function buildWeightedStack(
  nodes: readonly MosaicNode<string>[],
  weights: readonly number[],
  direction: "row" | "column",
): MosaicNode<string> {
  if (nodes.length === 1) return nodes[0];
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
  return {
    direction,
    first: nodes[0],
    second: buildWeightedStack(nodes.slice(1), weights.slice(1), direction),
    splitPercentage: (100 * weights[0]) / totalWeight,
  };
}

function buildLayoutTree(
  tiles: readonly PlaybackLayoutTile[],
  capabilities: PlaybackDeviceCapabilities,
): MosaicNode<string> | undefined {
  return (
    buildAutoLayout(
      tiles.map((tile) => tile.id),
      {},
      capabilities.viewportWidth / capabilities.viewportHeight,
    ) ?? undefined
  );
}

function buildDiagnosticsStack(
  plots: readonly string[],
  logs: readonly string[],
  unknown: readonly string[],
): MosaicNode<string> | null {
  return stackNodes([
    stackTiles(plots, "column"),
    stackTiles(logs, "column"),
    stackTiles(unknown, "column"),
  ]);
}

function stackTiles(
  tileIds: readonly string[],
  direction: "row" | "column",
): MosaicNode<string> | null {
  if (tileIds.length === 0) return null;
  if (tileIds.length === 1) return tileIds[0];

  const [first, ...rest] = tileIds;
  return {
    direction,
    first,
    second: stackTiles(rest, direction) as MosaicNode<string>,
    splitPercentage: 100 / tileIds.length,
  };
}

function stackNodes(
  nodes: readonly (MosaicNode<string> | null)[],
  options?: {
    readonly direction: "row" | "column";
    readonly splitPercentage: number;
  },
): MosaicNode<string> | null {
  const present = nodes.filter(
    (node): node is MosaicNode<string> => node !== null,
  );
  if (present.length === 0) return null;
  if (present.length === 1) return present[0];

  if (options && present.length === 2) {
    return {
      direction: options.direction,
      first: present[0],
      second: present[1],
      splitPercentage: options.splitPercentage,
    };
  }

  return {
    direction: "column",
    first: present[0],
    second: stackNodes(present.slice(1)) as MosaicNode<string>,
    splitPercentage: 100 / present.length,
  };
}

function normalizePositive(value: number | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
