import { useTileSettings, useTileSource } from "@fiftyone/tiling";
import { Size, Spinner } from "@voxel51/voodo";
import LidarSettings from "../../../../../playback/src/views/PlaybackTiles/LidarTile/LidarSettings";
import type { PointCloudVisualization } from "../../../decoders";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const PANEL_STYLE = { height: "100%", width: "100%" } as const;

const McapLidarTile: React.FC = () => {
  useTileSettings(LidarSettings);
  const sourceId = useTileSource();
  const frame = useMcapTopicStream<PointCloudVisualization>(sourceId ?? "");

  if (!frame) {
    return (
      <div style={styles.center}>
        <Spinner size={Size.Md} />
      </div>
    );
  }

  return <PointCloudPanel frame={frame} style={PANEL_STYLE} />;
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

export default McapLidarTile;
