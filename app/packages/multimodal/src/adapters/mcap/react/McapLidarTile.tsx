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
    // Re-bind when the inventory changes — covers both "no selection
    // yet" and "previous selection disappeared after a source/file
    // change". Without this, a stale topic keeps the tile in loading.
    if (lidars.length === 0) {
      if (topic !== null) setTopic(null);
      return;
    }
    if (topic === null || !lidars.some((l) => l.id === topic)) {
      setTopic(lidars[0].id);
    }
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
