import type { SampleRendererProps } from "@fiftyone/plugins";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import type { TilingTile } from "@fiftyone/tiling";
import MultiModalPlayback from "../../components/MultiModalPlayback/MultiModalPlayback";
import { PlaybackSyncMode } from "../../schemas/v1";
import { GridRenderer } from "./react";
import McapCameraTile from "./react/McapCameraTile";
import McapLidarTile from "./react/McapLidarTile";
import { McapStreams } from "./react/McapStreams";
import { useStableMcapSource } from "./react/use-stable-mcap-source";
import type { McapStreamSyncPolicies } from "./types";

// ---------------------------------------------------------------------------
// NuScenes topic config (POC — production will discover topics from inventory)
// ---------------------------------------------------------------------------

const CAMERA_TOPICS = [
  { topic: "/CAM_FRONT/image_rect_compressed", label: "Front camera" },
  { topic: "/CAM_FRONT_LEFT/image_rect_compressed", label: "Front-left camera" },
  { topic: "/CAM_FRONT_RIGHT/image_rect_compressed", label: "Front-right camera" },
  { topic: "/CAM_BACK/image_rect_compressed", label: "Back camera" },
  { topic: "/CAM_BACK_LEFT/image_rect_compressed", label: "Back-left camera" },
  { topic: "/CAM_BACK_RIGHT/image_rect_compressed", label: "Back-right camera" },
] as const;

const LIDAR_TOPIC = { topic: "/LIDAR_TOP", label: "Top lidar" } as const;

const CAMERA_SYNC_POLICY = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 120_000_000n,
} as const;

const STREAM_SYNC_POLICIES: McapStreamSyncPolicies = {
  "/CAM_FRONT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT_LEFT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT_RIGHT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_BACK/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_BACK_LEFT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_BACK_RIGHT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/LIDAR_TOP": {
    mode: PlaybackSyncMode.LATEST,
    toleranceBeforeNs: 200_000_000n,
  },
};

// One front camera + lidar visible on open. Sources are bound by McapStreams
// using the `${topic}-1` key convention at coordinator-ready time.
const INITIAL_TILES: Record<string, TilingTile> = {
  [`${CAMERA_TOPICS[0].topic}-1`]: {
    title: CAMERA_TOPICS[0].label,
    render: () => <McapCameraTile />,
  },
  [`${LIDAR_TOPIC.topic}-1`]: {
    title: LIDAR_TOPIC.label,
    render: () => <McapLidarTile />,
  },
};

function McapModalRenderer({ ctx }: SampleRendererProps) {
  const source = useStableMcapSource(ctx);
  const fileName = source?.sourceId.split("/").pop() ?? "recording.mcap";

  return (
    <MultiModalPlayback fileName={fileName} initialTiles={INITIAL_TILES} defaultLeftOpen={false} defaultRightOpen={false}>
      <McapStreams
        ctx={ctx}
        cameraTopics={[...CAMERA_TOPICS]}
        lidarTopic={LIDAR_TOPIC}
        streamPolicies={STREAM_SYNC_POLICIES}
      />
    </MultiModalPlayback>
  );
}

registerComponent({
  name: "McapRenderer",
  label: "Mcap Renderer",
  component: McapModalRenderer,
  type: PluginComponentType.SampleRenderer,
  activator: () => true,
  sampleRendererOptions: {
    supports: { extensions: ["mcap"] },
    grid: {
      enabled: true,
      overrideComponent: GridRenderer,
    },
  },
});
