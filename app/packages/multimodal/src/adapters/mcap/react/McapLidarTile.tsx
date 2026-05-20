import { useTileSettings, useTileSource } from "@fiftyone/tiling";
import { Size, Spinner } from "@voxel51/voodo";
import { useStream } from "../../../../../playback/src/lib/playback/use-stream";
import LidarSettings from "../../../../../playback/src/views/PlaybackTiles/LidarTile/LidarSettings";
import type { PointCloudVisualization } from "../../../decoders";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";

const PANEL_STYLE = { height: "100%", width: "100%" } as const;

/**
 * Lidar tile that renders a real MCAP-decoded point cloud via PointCloudPanel.
 * Reads its source stream id from the tiling context so the user can rebind
 * it to any registered lidar topic via the settings sidebar.
 */
const McapLidarTile: React.FC = () => {
  useTileSettings(LidarSettings);
  const sourceId = useTileSource();
  const frame = useStream<PointCloudVisualization>(sourceId ?? "");

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
