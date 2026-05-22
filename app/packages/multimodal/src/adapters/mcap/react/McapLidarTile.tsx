import { TileSettingsContent } from "@fiftyone/tiling";
import { Checkbox, Size, Spinner } from "@voxel51/voodo";
import React, { useEffect, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import settingsStyles from "../../../../../playback/src/views/PlaybackTiles/tile-settings.module.css";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapLidarTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const lidars = useSceneSourcesByType("lidar");

  useEffect(() => {
    if (topic !== null || lidars.length === 0) return;
    setTopic(lidars[0]?.id ?? null);
  }, [lidars, topic]);

  const frame = useMcapTopicStream<PointCloudVisualization>(topic ?? "");

  return (
    <>
      <TileSettingsContent>
        <div className={settingsStyles.root}>
          <Checkbox label="Color by height" defaultChecked />
          <Checkbox label="Show ground plane" />
          <Checkbox label="Show intensity overlay" />
          <Checkbox label="Cull behind sensor" defaultChecked />
        </div>
      </TileSettingsContent>
      {frame ? (
        <PointCloudPanel frame={frame} className={styles.panel} />
      ) : (
        <div className={styles.loading}>
          <Spinner size={Size.Lg} />
        </div>
      )}
    </>
  );
};

export default McapLidarTile;
