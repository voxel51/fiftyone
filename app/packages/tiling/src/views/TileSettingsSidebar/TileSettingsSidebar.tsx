import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useCallback } from "react";
import { useTiling } from "../../lib/TilingProvider";
import { useTileTitleFor } from "../../lib/use-tile-state";
import SidebarPanel from "../SidebarPanel/SidebarPanel";

const TileSettingsSidebar: React.FC = () => {
  const { focusedTileId, tiles, setSettingsSlotEl } = useTiling();
  const focusedTile =
    focusedTileId && tiles[focusedTileId] ? tiles[focusedTileId] : null;
  const titleOverride = useTileTitleFor(focusedTileId);
  const title = focusedTile
    ? `Settings: ${titleOverride ?? focusedTile.title}`
    : "Settings";

  const slotRef = useCallback(
    (el: HTMLDivElement | null) => setSettingsSlotEl(el),
    [setSettingsSlotEl],
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
