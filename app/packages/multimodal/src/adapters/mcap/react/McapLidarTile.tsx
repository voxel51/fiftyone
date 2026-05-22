import { Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

export interface McapLidarTileProps {
  /** MCAP topic this tile renders. Threaded in from the initial-tiles
   *  map's render closure. */
  topic: string;
}

const McapLidarTile: React.FC<McapLidarTileProps> = ({ topic }) => {
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
