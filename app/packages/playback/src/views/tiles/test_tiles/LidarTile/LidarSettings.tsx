import { Checkbox, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useMemo } from "react";
import {
  useSetTileSource,
  useStreamsByKind,
  useTileSource,
} from "../../../../lib/playback/use-tile-state";
import styles from "../../tile-settings.module.css";

const LidarSettings: React.FC = () => {
  const sources = useStreamsByKind("lidar");
  const sourceId = useTileSource();
  const setSource = useSetTileSource();

  const options = useMemo(
    () =>
      sources.map((s) => ({
        id: s.id,
        data: { label: s.tile.title },
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

      <Checkbox label="Color by height" defaultChecked />
      <Checkbox label="Show ground plane" />
      <Checkbox label="Show intensity overlay" />
      <Checkbox label="Cull behind sensor" defaultChecked />
    </div>
  );
};

export default LidarSettings;
