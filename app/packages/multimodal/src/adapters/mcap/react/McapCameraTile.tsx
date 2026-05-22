import { Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { ImagePanel } from "../../../visualization/panels/image";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

export interface McapCameraTileProps {
  /** MCAP topic this tile renders. Threaded in from the initial-tiles
   *  map's render closure. */
  topic: string;
}

const McapCameraTile: React.FC<McapCameraTileProps> = ({ topic }) => {
  const frame = useMcapTopicStream<EncodedImageVisualization>(topic);

  if (!frame) {
    return (
      <div className={styles.loading}>
        <Spinner size={Size.Md} />
      </div>
    );
  }

  return <ImagePanel frame={frame} className={styles.panel} />;
};

export default McapCameraTile;
