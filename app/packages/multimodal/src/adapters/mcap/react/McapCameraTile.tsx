import { useTileSettings, useTileSource } from "@fiftyone/tiling";
import { Size, Spinner } from "@voxel51/voodo";
import { useStream } from "../../../../../playback/src/lib/playback/use-stream";
import CameraSettings from "../../../../../playback/src/views/PlaybackTiles/CameraTile/CameraSettings";
import type { EncodedImageVisualization } from "../../../decoders";
import { ImagePanel } from "../../../visualization/panels/image";

const PANEL_STYLE = { height: "100%", width: "100%" } as const;

/**
 * Camera tile that renders a real MCAP-decoded encoded image via ImagePanel.
 * Reads its source stream id from the tiling context so the user can rebind
 * it to any registered camera topic via the settings sidebar.
 */
const McapCameraTile: React.FC = () => {
  useTileSettings(CameraSettings);
  const sourceId = useTileSource();
  const frame = useStream<EncodedImageVisualization>(sourceId ?? "");

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
