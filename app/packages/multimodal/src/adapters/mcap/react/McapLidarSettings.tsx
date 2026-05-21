import { useTileId } from "@fiftyone/tiling";
import { Checkbox, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtom } from "jotai";
import React, { useMemo } from "react";
import { useSceneSourcesByType } from "../../../scene-inventory";
import styles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import { mcapTileTopicAtom } from "./mcap-tile-selection";

const McapLidarSettings: React.FC = () => {
  const tileId = useTileId();
  const lidars = useSceneSourcesByType("lidar");
  const [topic, setTopic] = useAtom(mcapTileTopicAtom(tileId ?? ""));

  const options = useMemo(
    () =>
      lidars.map((l) => ({
        id: l.id,
        data: { label: l.label },
      })),
    [lidars]
  );

  return (
    <div className={styles.root}>
      <div className={styles.field}>
        <Text variant={TextVariant.Xs} color={TextColor.Secondary}>
          Source
        </Text>
        <Select
          options={options}
          value={topic ?? ""}
          onChange={(v) => setTopic((v as string) || null)}
        />
      </div>

      <Checkbox label="Color by height" defaultChecked />
      <Checkbox label="Show ground plane" />
      <Checkbox label="Show intensity overlay" />
      <Checkbox label="Cull behind sensor" defaultChecked />
    </div>
  );
};

export default McapLidarSettings;
