import type { SampleRendererProps } from "@fiftyone/plugins";
import { PluginComponentType, registerComponent } from "@fiftyone/plugins";
import MultiModalPlayback from "../../components/MultiModalPlayback/MultiModalPlayback";
import type { SceneSource } from "../../scene-inventory";
import { PlaybackSyncMode } from "../../schemas/v1";
import { GridRenderer } from "./react";
import { McapStreams } from "./react/McapStreams";
import { useStableMcapSource } from "./react/use-stable-mcap-source";
import type { McapStreamSyncPolicies } from "./types";

// ---------------------------------------------------------------------------
// NuScenes scene inventory (POC — production will discover this dynamically)
// ---------------------------------------------------------------------------

const SCENE_SOURCES: readonly SceneSource[] = [
  { id: "/CAM_FRONT/image_rect_compressed", type: "camera", label: "Front camera" },
  { id: "/CAM_FRONT_LEFT/image_rect_compressed", type: "camera", label: "Front-left camera" },
  { id: "/CAM_FRONT_RIGHT/image_rect_compressed", type: "camera", label: "Front-right camera" },
  { id: "/CAM_BACK/image_rect_compressed", type: "camera", label: "Back camera" },
  { id: "/CAM_BACK_LEFT/image_rect_compressed", type: "camera", label: "Back-left camera" },
  { id: "/CAM_BACK_RIGHT/image_rect_compressed", type: "camera", label: "Back-right camera" },
  { id: "/LIDAR_TOP", type: "lidar", label: "Top lidar" },
];

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

function McapModalRenderer({ ctx }: SampleRendererProps) {
  const source = useStableMcapSource(ctx);
  const fileName = source?.sourceId.split("/").pop() ?? "recording.mcap";

  return (
    <MultiModalPlayback
      fileName={fileName}
      sources={SCENE_SOURCES}
      defaultLeftOpen={false}
      defaultRightOpen={false}
    >
      <McapStreams ctx={ctx} streamPolicies={STREAM_SYNC_POLICIES} />
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
