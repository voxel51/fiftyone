import { Size, Spinner } from "@voxel51/voodo";
import React, { useEffect, useState } from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { ImagePanel } from "../../../visualization/panels/image";
import styles from "./McapTile.module.css";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const McapCameraTile: React.FC = () => {
  const [topic, setTopic] = useState<string | null>(null);
  const cameras = useSceneSourcesByType("camera");

  useEffect(() => {
    // Re-bind when the inventory changes — covers both "no selection
    // yet" and "previous selection disappeared after a source/file
    // change". Without this, a stale topic keeps the tile in loading.
    if (cameras.length === 0) {
      if (topic !== null) setTopic(null);
      return;
    }
    if (topic === null || !cameras.some((c) => c.id === topic)) {
      setTopic(cameras[0].id);
    }
  }, [cameras, topic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic ?? "");

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
