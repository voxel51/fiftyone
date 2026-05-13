import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useTiling } from "../../lib/TilingProvider";
import SidebarPanel from "../SidebarPanel/SidebarPanel";

/**
 * Left-hand sidebar that renders the focused tile's settings component,
 * if one was registered via `useTileSettings`. Otherwise shows an empty
 * state hint. Reads directly from the surrounding `TilingProvider`.
 *
 * The header reads "Settings: <tile title>" so it's obvious which tile
 * is being configured.
 */
const TileSettingsSidebar: React.FC = () => {
  const { focusedTileId, FocusedTileSettings, tiles } = useTiling();
  // Defend against a stale focusedTileId — possible if a tile is removed
  // mid-render or the consumer's layout state races ahead of the registry.
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const title = focusedTile ? `Settings: ${focusedTile.title}` : "Settings";
  return (
    <SidebarPanel title={title}>
      {focusedTile && FocusedTileSettings ? (
        <FocusedTileSettings />
      ) : (
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Focus a tile to edit its settings.
        </Text>
      )}
    </SidebarPanel>
  );
};

export default TileSettingsSidebar;
