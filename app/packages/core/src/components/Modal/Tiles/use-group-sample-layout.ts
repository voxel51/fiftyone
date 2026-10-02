import { collectTileIds, type TilingTile } from "@fiftyone/tiling";
import { useState } from "react";
import type { MosaicNode } from "react-mosaic-component";
import {
  availableGroupTileTypes,
  createGroupTile,
  defaultGroupLayout,
  type GroupTileFacts,
  type ResolvedGroupLayout,
} from "./group-tile-catalog";
import { readGroupLayout } from "./layout-persistence";
import { isGroupTileType, tileTypeFromId } from "./tile-types";

export interface GroupSampleLayout {
  readonly initialTiles: Record<string, TilingTile>;
  readonly initialLayout: MosaicNode<string> | null;
  readonly initialExpandedTileId: string | null;
  readonly resetTiles: Record<string, TilingTile>;
  readonly resetLayout: MosaicNode<string> | null;
}

/**
 * Rebuild tile entries from a persisted mosaic tree. Returns `null` when
 * any leaf names a kind this dataset doesn't offer (e.g. a 3D tile saved
 * before the 3D slice was removed) so the caller falls back to defaults.
 */
export function restoreGroupLayout(
  layout: MosaicNode<string>,
  facts: GroupTileFacts,
): ResolvedGroupLayout | null {
  const available = new Set<string>(availableGroupTileTypes(facts));
  const tiles: Record<string, TilingTile> = {};
  for (const id of collectTileIds(layout)) {
    const type = tileTypeFromId(id);
    if (!type || !isGroupTileType(type) || !available.has(type)) {
      return null;
    }
    tiles[id] = createGroupTile(type);
  }
  return { tiles, layout };
}

/**
 * Mount-time layout for the group sample view: the dataset's persisted
 * arrangement when it restores cleanly, the built-in arrangement otherwise.
 * Resolved once per mount; `TilingProvider` reads these props only then.
 */
export function useGroupSampleLayout(
  facts: GroupTileFacts,
  datasetId: string | null | undefined,
): GroupSampleLayout {
  const [resolved] = useState<GroupSampleLayout>(() => {
    const defaults = defaultGroupLayout(facts);
    const persisted = datasetId ? readGroupLayout(datasetId) : null;
    const restored =
      persisted?.layout != null
        ? restoreGroupLayout(persisted.layout, facts)
        : null;
    const initial = restored ?? defaults;
    const expanded = persisted?.expandedTileId ?? null;
    return {
      initialTiles: initial.tiles,
      initialLayout: initial.layout,
      initialExpandedTileId:
        restored &&
        expanded &&
        collectTileIds(restored.layout).includes(expanded)
          ? expanded
          : null,
      resetTiles: defaults.tiles,
      resetLayout: defaults.layout,
    };
  });
  return resolved;
}
