import { collectTileIds, useTiling, type TilingTile } from "@fiftyone/tiling";
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type { MosaicNode } from "react-mosaic-component";
import {
  mcapTileTypeFromId,
  readMcapModalLayout,
  writeMcapModalLayout,
} from "./mcap-layout-persistence";
import { getMcapTileDefinition } from "./use-mcap-tiles";
import { useMcapInitialTiles } from "./use-mcap-scene-inventory";

export interface McapModalLayout {
  initialTiles: Record<string, TilingTile>;
  /** `undefined` lets the TilingProvider auto-lay-out `initialTiles`. */
  initialLayout: MosaicNode<string> | undefined;
  defaultLeftOpen: boolean;
  defaultRightOpen: boolean;
  onLeftOpenChange: (open: boolean) => void;
  onRightOpenChange: (open: boolean) => void;
}

/**
 * Mount-time layout state for the MCAP modal: the user's persisted
 * sidebar visibility and tile arrangement when one restores cleanly,
 * the built-in defaults otherwise. Pair with
 * `<McapModalLayoutPersistence />` (inside the playback shell) to write
 * changes back.
 */
export function useMcapModalLayout(fileName: string): McapModalLayout {
  const defaultTiles = useMcapInitialTiles(fileName);
  // Read storage once per modal mount — navigating samples remounts the
  // renderer and picks up whatever the previous sample persisted.
  const persisted = useMemo(readMcapModalLayout, []);

  const restored = useMemo(
    () => rebuildTilesFromLayout(persisted?.layout),
    [persisted]
  );

  const onLeftOpenChange = useCallback((open: boolean) => {
    writeMcapModalLayout({ leftSidebarOpen: open });
  }, []);
  const onRightOpenChange = useCallback((open: boolean) => {
    writeMcapModalLayout({ rightSidebarOpen: open });
  }, []);

  return {
    initialTiles: restored?.tiles ?? defaultTiles,
    initialLayout: restored?.layout,
    defaultLeftOpen: persisted?.leftSidebarOpen ?? false,
    defaultRightOpen: persisted?.rightSidebarOpen ?? false,
    onLeftOpenChange,
    onRightOpenChange,
  };
}

/**
 * Rebuild the tile entries a persisted mosaic tree references. All-or-
 * nothing: if any leaf id doesn't map to a known tile type the whole
 * restore is discarded, so a partially-recognized layout can't render
 * half a workspace.
 */
function rebuildTilesFromLayout(
  layout: MosaicNode<string> | null | undefined
): { layout: MosaicNode<string>; tiles: Record<string, TilingTile> } | null {
  if (layout === null || layout === undefined) return null;
  const tileIds = collectTileIds(layout);
  if (tileIds.length === 0) return null;

  const tiles: Record<string, TilingTile> = {};
  for (const id of tileIds) {
    const type = mcapTileTypeFromId(id);
    const definition = type ? getMcapTileDefinition(type) : null;
    if (!definition) return null;
    const Tile = definition.Tile;
    tiles[id] = {
      title: definition.typeLabel,
      render: () => <Tile />,
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
    []
  );

  return null;
}
