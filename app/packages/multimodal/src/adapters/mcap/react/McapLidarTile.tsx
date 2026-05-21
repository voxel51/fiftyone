import { useTileId, useTileSettings } from "@fiftyone/tiling";
import { Size, Spinner } from "@voxel51/voodo";
import { useAtom } from "jotai";
import { useEffect } from "react";
import type { PointCloudVisualization } from "../../../decoders";
import { useSceneSourcesByType } from "../../../scene-inventory";
import { PointCloudPanel } from "../../../visualization/panels/point-cloud";
import McapLidarSettings from "./McapLidarSettings";
import { mcapTileTopicAtom } from "./mcap-tile-selection";
import { useMcapTopicStream } from "./use-mcap-topic-stream";

const PANEL_STYLE = { height: "100%", width: "100%" } as const;

const McapLidarTile: React.FC = () => {
  useTileSettings(McapLidarSettings);
  const tileId = useTileId();
  const lidars = useSceneSourcesByType("lidar");
  const [topic, setTopic] = useAtom(mcapTileTopicAtom(tileId ?? ""));

  useEffect(() => {
    if (topic !== null || lidars.length === 0) return;
    setTopic(lidars[0]?.id ?? null);
  }, [lidars, topic, setTopic]);

  const frame = useMcapTopicStream<PointCloudVisualization>(topic ?? "");

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
