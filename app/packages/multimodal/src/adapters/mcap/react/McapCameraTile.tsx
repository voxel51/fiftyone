import { useTileId, useTileSettings } from "@fiftyone/tiling";
import { Size, Spinner } from "@voxel51/voodo";
import { useAtom } from "jotai";
import { useEffect } from "react";
import type { EncodedImageVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { ImagePanel } from "../../../visualization/panels/image";
import McapCameraSettings from "./McapCameraSettings";
import { mcapTileTopicAtom } from "./mcap-tile-selection";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const PANEL_STYLE = { height: "100%", width: "100%" } as const;

const McapCameraTile: React.FC = () => {
  useTileSettings(McapCameraSettings);
  const tileId = useTileId();
  const cameras = useSceneSourcesByType("camera");
  const [topic, setTopic] = useAtom(mcapTileTopicAtom(tileId ?? ""));

  // Auto-bind to the first available camera the first time we render
  // with one available and nothing chosen yet.
  useEffect(() => {
    if (topic !== null || cameras.length === 0) return;
    setTopic(cameras[0]?.id ?? null);
  }, [cameras, topic, setTopic]);

  const frame = useMcapTopicStream<EncodedImageVisualization>(topic ?? "");

  if (!frame) {
    return (
      <div style={styles.center}>
        <Spinner size={Size.Md} />
      </div>
    );
  }

  return <ImagePanel frame={frame} style={PANEL_STYLE} />;
};

const styles = {
  center: {
    alignItems: "center",
    display: "flex",
    height: "100%",
    justifyContent: "center",
    width: "100%",
  },
} as const;

export default McapCameraTile;
