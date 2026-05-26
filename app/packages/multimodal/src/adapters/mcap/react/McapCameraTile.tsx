import { Size, Spinner } from "@voxel51/voodo";
import React from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { ImagePanel } from "../../../visualization/panels/image";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapCameraTile: React.FC = () => {
  const cameras = useSceneSourcesByType("camera");
  const topic = cameras[0]?.id ?? "";
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
