import { collectTileIds, useTiling, type TilingTile } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { MosaicNode } from "react-mosaic-component";
import type { ByteSourceReadProfile } from "../../../query/bytes";
import type { SceneSource } from "../../../scene-inventory";
import {
  mcapTileTypeFromId,
  readMcapModalLayout,
  writeMcapModalLayout,
} from "./mcap-layout-persistence";
import { MCAP_TILE_TYPE } from "./mcap-tile-types";
import {
  collectPlaybackDeviceCapabilities,
  rankImageSources,
  resolvePlaybackLayout,
  type PlaybackDeviceCapabilities,
  type PlaybackLayoutTile,
} from "./playback-layout";
import { getMcapTileDefinition, mcapTileTypesFor } from "./use-mcap-tiles";

export interface McapModalLayout {
  initialTiles: Record<string, TilingTile>;
  /** `undefined` lets the TilingProvider auto-lay-out `initialTiles`. */
  initialLayout: MosaicNode<string> | undefined;
  defaultLeftOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  /** Persisted sidebar width; `undefined` keeps the shell's default. */
  defaultLeftSidebarWidth: number | undefined;
  onLeftSidebarWidthChange: (px: number) => void;
}

export interface UseMcapModalLayoutOptions {
  sources: readonly SceneSource[];
  /**
   * Persistence scope — `ctx.dataset.datasetId` (stable across dataset
   * renames, unlike the name). Absent, reads/writes hit only the
   * browser-wide fallback entry.
   */
  datasetId?: string;
  /** Source locality hint; tightens the default tile budget when remote. */
  readProfile?: ByteSourceReadProfile;
  /** Capability override for tests; collected from the browser when absent. */
  capabilities?: PlaybackDeviceCapabilities;
}

/**
 * Mount-time layout state for the MCAP modal: the user's persisted
 * sidebar visibility and tile arrangement when one restores cleanly
 * against the current scene, the resolver's defaults otherwise — a
 * budgeted grid of image tiles (densest sources first) beside one fused
 * 3D tile, sized to the machine, the source locality, and the viewport
 * (see `resolvePlaybackLayout`). Pair with
 * `<McapModalLayoutPersistence />` (inside the playback shell) to write
 * changes back.
 */
export function useMcapModalLayout({
  sources,
  datasetId,
  readProfile,
  capabilities,
}: UseMcapModalLayoutOptions): McapModalLayout {
  const presentTypes = useMemo(
    () => Array.from(new Set(sources.map((s) => s.type))),
    [sources],
  );
  const resolved = useMemo(
    () =>
      resolvePlaybackLayout({
        capabilities: capabilities ?? collectPlaybackDeviceCapabilities(),
        readProfile,
        sources,
      }),
    [sources, readProfile, capabilities],
  );
  const defaultTiles = useMemo(
    () => buildResolvedTiles(resolved.tiles),
    [resolved],
  );
  // Re-read storage whenever the scene changes: the renderer persists
  // across sample navigation, so a new sample arrives as new sources on
  // the same mount and must pick up whatever the previous sample persisted.
  const persisted = useMemo(
    () => readMcapModalLayout(datasetId),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sources is the storage-read trigger, not an input
    [datasetId, sources],
  );

  const restored = useMemo(
    () => rebuildTilesFromLayout(persisted?.layout, presentTypes, sources),
    [persisted, presentTypes, sources],
  );

  const onLeftOpenChange = useCallback(
    (open: boolean) => {
      writeMcapModalLayout({ leftSidebarOpen: open }, datasetId);
    },
    [datasetId],
  );

  const onLeftSidebarWidthChange = useCallback(
    (px: number) => {
      writeMcapModalLayout({ sidebarWidthPx: px }, datasetId);
    },
    [datasetId],
  );

  return {
    initialTiles: restored?.tiles ?? defaultTiles,
    initialLayout: restored?.layout ?? resolved.layout,
    defaultLeftOpen: persisted?.leftSidebarOpen ?? true,
    onLeftOpenChange,
    defaultLeftSidebarWidth: persisted?.sidebarWidthPx,
    onLeftSidebarWidthChange,
  };
}

/**
 * Materializes the resolver's tile descriptors into tiling entries,
 * threading each tile's assigned source into its render closure.
 */
function buildResolvedTiles(
  tiles: readonly PlaybackLayoutTile[],
): Record<string, TilingTile> {
  const result: Record<string, TilingTile> = {};
  for (const tile of tiles) {
    const definition = getMcapTileDefinition(tile.tileType);
    if (!definition) continue;
    const Tile = definition.Tile;
    const initialSourceId = tile.initialSourceId;
    result[tile.id] = {
      title: tile.title,
      render: () => <Tile initialSourceId={initialSourceId} />,
    };
  }
  return result;
}

/**
 * Prune a mosaic tree down to the leaves `isValidLeaf` accepts. Mosaic
 * trees are binary, so removing a leaf promotes its sibling into the
 * parent's slot (the parent's own split percentage goes with the
 * parent; surviving parents keep theirs). Returns `null` when nothing
 * survives.
 */
export function pruneMosaicLayout(
  node: MosaicNode<string>,
  isValidLeaf: (id: string) => boolean,
): MosaicNode<string> | null {
  if (typeof node === "string") return isValidLeaf(node) ? node : null;
  const first = pruneMosaicLayout(node.first, isValidLeaf);
  const second = pruneMosaicLayout(node.second, isValidLeaf);
  if (first !== null && second !== null) return { ...node, first, second };
  return first ?? second;
}

/**
 * Rebuild the tile entries a persisted mosaic tree references. Leaves
 * that can't render against the current scene — unknown tile type, no
 * source of that kind present, or no tile definition — are pruned from
 * the tree (sibling promotes into the parent's slot), so a layout saved
 * with a 3D topic still keeps its image tiles when opened on an
 * image-only recording instead of resetting, while never rendering dead
 * tiles. Only when nothing survives does the whole restore fall back to
 * the resolver defaults.
 *
 * Persistence stores the arrangement, not per-tile bindings, so
 * surviving image leaves rebind positionally (depth-first order of the
 * pruned tree) to the ranked sources of the current recording (densest
 * first) — restored multi-camera layouts open on distinct streams
 * instead of all defaulting to the same one.
 */
function rebuildTilesFromLayout(
  layout: MosaicNode<string> | null | undefined,
  presentTypes: readonly string[],
  sources: readonly SceneSource[],
): { layout: MosaicNode<string>; tiles: Record<string, TilingTile> } | null {
  if (layout === null || layout === undefined) return null;

  const availableTypes = new Set<string>(mcapTileTypesFor(presentTypes));
  const isValidLeaf = (id: string): boolean => {
    const type = mcapTileTypeFromId(id);
    if (!type || !availableTypes.has(type)) return false;
    return getMcapTileDefinition(type) !== null;
  };
  const pruned = pruneMosaicLayout(layout, isValidLeaf);
  if (pruned === null) return null;
  const tileIds = collectTileIds(pruned);
  if (tileIds.length === 0) return null;

  const rankedImages = rankImageSources(sources);
  let imageLeafIndex = 0;
  const tiles: Record<string, TilingTile> = {};
  for (const id of tileIds) {
    const type = mcapTileTypeFromId(id);
    // Pruning guarantees every surviving leaf maps to a definition.
    const definition = type ? getMcapTileDefinition(type) : null;
    if (!definition) return null;
    const Tile = definition.Tile;
    const initialSourceId =
      type === MCAP_TILE_TYPE.IMAGE
        ? rankedImages[imageLeafIndex++]?.id
        : undefined;
    tiles[id] = {
      title: definition.typeLabel,
      render: () => <Tile initialSourceId={initialSourceId} />,
    };
  }
  return { layout: pruned, tiles };
}

export interface McapModalLayoutPersistenceProps {
  /** Persistence scope — same `datasetId` given to `useMcapModalLayout`. */
  datasetId?: string;
}

/**
 * Non-visual observer that persists the tile arrangement. Render inside
 * the playback shell (any descendant of its TilingProvider), next to the
 * stream-registration children.
 *
 * Mosaic emits layout updates continuously while a divider is dragged,
 * so writes are debounced; the final state is flushed on unmount (modal
 * close / sample navigation).
 */
export function McapModalLayoutPersistence({
  datasetId,
}: McapModalLayoutPersistenceProps): React.ReactElement | null {
  const { layout } = useTiling();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;
  const datasetIdRef = useRef(datasetId);
  datasetIdRef.current = datasetId;

  // This effect syncs the mosaic layout to localStorage (debounced) —
  // persistence is an external system, so an effect is the right tool.
  useEffect(() => {
    const timeout = setTimeout(() => {
      writeMcapModalLayout({ layout }, datasetId);
    }, 500);
    return () => clearTimeout(timeout);
  }, [layout, datasetId]);

  // This effect flushes the latest layout on unmount so a pending
  // debounce can't drop the user's final arrangement.
  useEffect(
    () => () => {
      writeMcapModalLayout({ layout: layoutRef.current }, datasetIdRef.current);
    },
    [],
  );

  return null;
}
