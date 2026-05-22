import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox, Size, Spinner } from "@voxel51/voodo";
import React, { useEffect, useState } from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { ImagePanel } from "../../../visualization/panels/image";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

/**
 * Camera tile body. Picks its source from the scene inventory and
 * holds it in local React state — auto-binds to the first available
 * camera on mount.
 */
const McapCameraTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const cameras = useSceneSourcesByType("camera");

  useEffect(() => {
    if (topic !== null || cameras.length === 0) return;
    setTopic(cameras[0]?.id ?? null);
  }, [cameras, topic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic ?? "");

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
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
