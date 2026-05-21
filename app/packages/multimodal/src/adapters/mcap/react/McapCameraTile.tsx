import { useTileSettings, useTileSource } from "@fiftyone/tiling";
import { Size, Spinner } from "@voxel51/voodo";
import CameraSettings from "../../../../../playback/src/views/PlaybackTiles/CameraTile/CameraSettings";
import type { EncodedImageVisualization } from "../../../decoders";
import { ImagePanel } from "../../../visualization/panels/image";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const PANEL_STYLE = { height: "100%", width: "100%" } as const;

const McapCameraTile: React.FC = () => {
  useTileSettings(CameraSettings);
  const sourceId = useTileSource();
  const frame = useMcapTopicStream<EncodedImageVisualization>(sourceId ?? "");

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
