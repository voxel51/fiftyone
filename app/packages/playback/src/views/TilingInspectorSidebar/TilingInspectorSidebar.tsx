import { Text, TextColor, TextVariant } from "@voxel51/voodo";
import React from "react";
import { useTiling } from "../../lib/TilingProvider";
import SidebarPanel from "../SidebarPanel/SidebarPanel";

/**
 * Right-hand sidebar showing inspection details for the currently
 * focused tile. Today it renders just the focused id as a placeholder —
 * future iterations can pull in per-tile metadata (stream id, current
 * value, source URL, etc.).
 */
const TilingInspectorSidebar: React.FC = () => {
  const { focusedTileId } = useTiling();
  return (
    <SidebarPanel title="Inspector">
      {focusedTileId ? (
        <>
          <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
            Focused tile
          </Text>
          <Text variant={TextVariant.Sm} color={TextColor.Primary}>
            {focusedTileId}
          </Text>
        </>
      ) : (
        <Text variant={TextVariant.Sm} color={TextColor.Muted}>
          Select a tile to inspect.
        </Text>
      )}
    </SidebarPanel>
  );
};

export default TilingInspectorSidebar;
