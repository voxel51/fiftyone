import { Checkbox, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useMemo } from "react";
import {
  useSetTileSource,
  useTileSourcesByType,
  useTileSource,
} from "@fiftyone/tiling";
import styles from "@fiftyone/tiling/src/views/Tile/tile-settings.module.css";

/**
 * Source picker + per-tile toggles. The picker enumerates every
 * registered camera stream so the user can rebind the focused tile to
 * any of them without spawning a new tile.
 */
const CameraSettings: React.FC = () => {
  const sources = useTileSourcesByType("camera");
  const sourceId = useTileSource();
  const setSource = useSetTileSource();

  const options = useMemo(
    () =>
      sources.map((s) => ({
        id: s.streamId,
        data: { label: s.title },
      })),
    [sources]
  );

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Source
        </Text>
        <Select
          options={options}
          value={sourceId ?? ""}
          onChange={(v) => setSource((v as string) || null)}
        />
      </div>

      <Checkbox label="Show overlays" defaultChecked />
      <Checkbox label="Show bounding boxes" />
      <Checkbox label="Show track ids" />
    </div>
  );
};

export default CameraSettings;
