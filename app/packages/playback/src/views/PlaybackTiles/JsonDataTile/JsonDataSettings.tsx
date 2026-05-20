import { Checkbox, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import React, { useMemo } from "react";
import {
  useSetTileSource,
  useTileSourcesByType,
  useTileSource,
} from "@fiftyone/tiling";
import styles from "../tile-settings.module.css";

const JsonDataSettings: React.FC = () => {
  const sources = useTileSourcesByType("json");
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

      <Checkbox label="Pretty-print" defaultChecked />
      <Checkbox label="Show types" />
    </div>
  );
};

export default JsonDataSettings;
