import { Select, SelectAnchor, ZIndex } from "@voxel51/voodo";
import React, { useMemo } from "react";
import type { SceneSource } from "../../../ir";
import SidebarGroup from "../settings/controls/SidebarGroup";
import settingsStyles from "../tiles/Tile.settings.module.css";

export interface AudioTileSettingsProps {
  readonly sources: readonly SceneSource[];
  readonly sourceId: string | undefined;
  readonly onSelectSource: (sourceId: string) => void;
}

/**
 * Sidebar settings for the Audio tile: which audio source it shows.
 *
 * The tile used to bind to `sources[0]` with no way to change it, so a
 * recording with several audio topics could only ever display the first.
 */
const AudioTileSettings: React.FC<AudioTileSettingsProps> = ({
  onSelectSource,
  sourceId,
  sources,
}) => {
  const options = useMemo(
    () =>
      sources.map((source) => ({
        data: { label: source.label },
        id: source.id,
      })),
    [sources],
  );

  return (
    <div className={settingsStyles.root}>
      <SidebarGroup title="Source">
        <Select
          anchor={SelectAnchor.BottomStart}
          aria-label="Audio source"
          exclusive
          onChange={(value) => {
            if (typeof value === "string") onSelectSource(value);
          }}
          options={options}
          portal
          value={sourceId ?? ""}
          zIndex={ZIndex.AboveModal}
        />
      </SidebarGroup>
    </div>
  );
};

export default AudioTileSettings;
