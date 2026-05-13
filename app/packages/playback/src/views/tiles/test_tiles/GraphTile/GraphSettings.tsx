import { Checkbox, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useMemo } from "react";
import {
  useSetTileSource,
  useStreamsByKind,
  useTileSource,
} from "../../../../lib/playback/use-tile-state";
import styles from "../../tile-settings.module.css";

const GraphSettings: React.FC = () => {
  const sources = useStreamsByKind("graph");
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

      <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
        Series
      </Text>
      <Checkbox label="velocity" defaultChecked />
      <Checkbox label="accel" defaultChecked />

      <Checkbox label="Show playhead" defaultChecked />
      <Checkbox label="Smooth lines" />
    </div>
  );
};

export default GraphSettings;
