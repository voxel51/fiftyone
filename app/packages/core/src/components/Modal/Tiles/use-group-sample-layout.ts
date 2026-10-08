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
import {
  layoutScopeKey,
  readGroupLayout,
  type SampleLayoutKind,
} from "./layout-persistence";
import { createPanelTile, panelNameFromTileType } from "./panel-tiles";
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
 * any leaf names a built-in kind this dataset doesn't offer (e.g. a 3D tile
 * saved before the 3D slice was removed) so the caller falls back to
 * defaults. Panel kinds always restore: plugins register after mount, and a
 * panel that never shows up renders the Spaces "panel not found" state.
 */
export function restoreGroupLayout(
  layout: MosaicNode<string>,
  facts: GroupTileFacts,
): ResolvedGroupLayout | null {
  const available = new Set<string>(availableGroupTileTypes(facts));
  const tiles: Record<string, TilingTile> = {};
  for (const id of collectTileIds(layout)) {
    const type = tileTypeFromId(id);
    if (!type) return null;
    const panelName = panelNameFromTileType(type);
    if (panelName !== null) {
      if (!panelName) return null;
      tiles[id] = createPanelTile(panelName);
      continue;
    }
    if (!isGroupTileType(type) || !available.has(type)) {
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
  kind: SampleLayoutKind,
): GroupSampleLayout {
  const [resolved] = useState<GroupSampleLayout>(() => {
    const defaults = defaultGroupLayout(facts);
    const persisted = datasetId
      ? readGroupLayout(layoutScopeKey(datasetId, kind))
      : null;
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
