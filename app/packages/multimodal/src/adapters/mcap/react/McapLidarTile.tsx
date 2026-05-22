import { Size, Spinner } from "@voxel51/voodo";
import React, { useEffect, useState } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
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

  if (!frame) {
    return (
      <div className={styles.loading}>
        <Spinner size={Size.Md} />
      </div>
    );
  }

  return <PointCloudPanel frame={frame} className={styles.panel} />;
};

export default McapLidarTile;
