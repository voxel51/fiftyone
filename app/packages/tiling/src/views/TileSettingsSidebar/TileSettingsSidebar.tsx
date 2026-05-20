import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback } from "react";
import { useTiling } from "../../lib/TilingProvider";
import { useTileTitleFor } from "../../lib/use-tile-state";
import SidebarPanel from "../SidebarPanel/SidebarPanel";

/**
 * Left-hand sidebar that hosts the focused tile's settings UI. Owns
 * the portal target — the tile body's `<TileSettingsContent>` portals
 * its children here when this tile is focused. Renders the empty
 * state hint when no tile is focused.
 *
 * The header reflects the tile's runtime title — if the body has
 * published an override via `useSetTileTitle`, the override wins;
 * otherwise the static `tile.title` is used.
 */
const TileSettingsSidebar: React.FC = () => {
  const { focusedTileId, tiles, setSettingsSlotEl } = useTiling();
  // Defend against a stale focusedTileId — possible if a tile is removed
  // mid-render or the consumer's layout state races ahead of the registry.
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const titleOverride = useTileTitleFor(focusedTileId);
  const title = focusedTile
    ? `Settings: ${titleOverride ?? focusedTile.title}`
    : "Settings";

  // Stable ref callback so `setSettingsSlotEl` isn't fired on every render.
  const slotRef = useCallback(
    (el: HTMLDivElement | null) => setSettingsSlotEl(el),
    [setSettingsSlotEl]
  );

  return (
    <SidebarPanel title={title}>
      <div ref={slotRef} />
      {!focusedTile && (
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Focus a tile to edit its settings.
        </Text>
      )}
    </SidebarPanel>
  );
};

export default TileSettingsSidebar;
