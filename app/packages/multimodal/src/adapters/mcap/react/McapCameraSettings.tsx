import { useTileId } from "@fiftyone/tiling";
import { Checkbox, Select, Text, TextColor, TextVariant } from "@voxel51/voodo";
import { useAtom } from "jotai";
import React, { useMemo } from "react";
import { useSceneSourcesByType } from "../../../scene-inventory";
import styles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import { mcapTileTopicAtom } from "./mcap-tile-selection";

/**
 * Source dropdown for an MCAP camera tile. Reads available cameras
 * from the scene inventory and writes the focused tile's selection
 * into the same atomFamily the tile body reads from.
 */
const McapCameraSettings: React.FC = () => {
  const tileId = useTileId();
  const cameras = useSceneSourcesByType("camera");
  const [topic, setTopic] = useAtom(mcapTileTopicAtom(tileId ?? ""));

  const options = useMemo(
    () =>
      cameras.map((c) => ({
        id: c.id,
        data: { label: c.label },
      })),
    [cameras]
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

      <Checkbox label="Show overlays" defaultChecked />
      <Checkbox label="Show bounding boxes" />
      <Checkbox label="Show track ids" />
    </div>
  );
};

export default McapCameraSettings;
