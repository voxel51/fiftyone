import { TileSettingsContent } from "@fiftyone/tiling";
import {
  Checkbox,
  Select,
  Size,
  Spinner,
  Text,
  TextColor,
  TextVariant,
} from "@voxel51/voodo";
import React, { useEffect, useMemo, useState } from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { ImagePanel } from "../../../visualization/panels/image";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapCameraTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const cameras = useSceneSourcesByType("camera");

  // Auto-bind to the first available camera the first time we render
  // with one available and nothing chosen yet.
  useEffect(() => {
    if (topic !== null || cameras.length === 0) return;
    setTopic(cameras[0]?.id ?? null);
  }, [cameras, topic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic ?? "");
  const options = useMemo(
    () => cameras.map((c) => ({ id: c.id, data: { label: c.label } })),
    [cameras]
  );

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <div className={settingsStyles.field}>
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
      </TileSettingsContent>
      {frame ? (
        <ImagePanel frame={frame} className={styles.panel} />
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

export default McapCameraTile;
