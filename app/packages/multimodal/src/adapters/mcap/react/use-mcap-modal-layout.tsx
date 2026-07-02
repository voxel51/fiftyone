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
  defaultRightOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  onRightOpenChange: (open: boolean) => void;
}

export interface UseMcapModalLayoutOptions {
  sources: readonly SceneSource[];
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- sources is the storage-read trigger, not an input
  const persisted = useMemo(readMcapModalLayout, [sources]);

  const restored = useMemo(
    () => rebuildTilesFromLayout(persisted?.layout, presentTypes, sources),
    [persisted, presentTypes, sources],
  );

  const onLeftOpenChange = useCallback((open: boolean) => {
    writeMcapModalLayout({ leftSidebarOpen: open });
  }, []);
  const onRightOpenChange = useCallback((open: boolean) => {
    writeMcapModalLayout({ rightSidebarOpen: open });
  }, []);

  return {
    initialTiles: restored?.tiles ?? defaultTiles,
    initialLayout: restored?.layout ?? resolved.layout,
    defaultLeftOpen: persisted?.leftSidebarOpen ?? false,
    defaultRightOpen: persisted?.rightSidebarOpen ?? false,
    onLeftOpenChange,
    onRightOpenChange,
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
 * Rebuild the tile entries a persisted mosaic tree references. All-or-
 * nothing: if any leaf id doesn't map to a known tile type — or no
 * source in the current scene can feed that tile kind — the whole
 * restore is discarded, so a layout saved against a differently-shaped
 * recording can't render dead tiles.
 *
 * Persistence stores the arrangement, not per-tile bindings, so image
 * leaves rebind positionally to the ranked sources of the current
 * recording (densest first) — restored multi-camera layouts open on
 * distinct streams instead of all defaulting to the same one.
 */
function rebuildTilesFromLayout(
  layout: MosaicNode<string> | null | undefined,
  presentTypes: readonly string[],
  sources: readonly SceneSource[],
): { layout: MosaicNode<string>; tiles: Record<string, TilingTile> } | null {
  if (layout === null || layout === undefined) return null;
  const tileIds = collectTileIds(layout);
  if (tileIds.length === 0) return null;

  const availableTypes = new Set<string>(mcapTileTypesFor(presentTypes));
  const rankedImages = rankImageSources(sources);
  let imageLeafIndex = 0;
  const tiles: Record<string, TilingTile> = {};
  for (const id of tileIds) {
    const type = mcapTileTypeFromId(id);
    if (!type || !availableTypes.has(type)) return null;
    const definition = getMcapTileDefinition(type);
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
  return { layout, tiles };
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
export function McapModalLayoutPersistence(): React.ReactElement | null {
  const { layout } = useTiling();
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // This effect syncs the mosaic layout to localStorage (debounced) —
  // persistence is an external system, so an effect is the right tool.
  useEffect(() => {
    const timeout = setTimeout(() => {
      writeMcapModalLayout({ layout });
    }, 500);
    return () => clearTimeout(timeout);
  }, [layout]);

  // This effect flushes the latest layout on unmount so a pending
  // debounce can't drop the user's final arrangement.
  useEffect(
    () => () => {
      writeMcapModalLayout({ layout: layoutRef.current });
    },
    [],
  );

  return null;
}
