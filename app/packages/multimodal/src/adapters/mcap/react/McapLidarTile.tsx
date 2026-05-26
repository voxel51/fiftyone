import { Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapLidarTile: React.FC = () => {
  const lidars = useSceneSourcesByType("lidar");
  const topic = lidars[0]?.id ?? "";
  const frame = useMcapTopicStream<PointCloudVisualization>(topic);

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
