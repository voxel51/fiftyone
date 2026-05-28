import type { TilingTile } from "@fiftyone/tiling";
import type { SceneSource } from "../../../scene-inventory";
import { PlaybackSyncMode } from "../../../schemas/v1";
import type { McapStreamSyncPolicies } from "../types";
import McapCameraTile from "./McapCameraTile";
import McapLidarTile from "./McapLidarTile";

// ---------------------------------------------------------------------------
// Mock NuScenes scene metadata. Eventually these hooks will parse the MCAP
// file (channels + schemas) to discover what's actually present; for now
// they return the fixed NuScenes config regardless of `fileName`.
// ---------------------------------------------------------------------------

const NUSCENES_SOURCES: readonly SceneSource[] = [
  {
    id: "/CAM_FRONT/image_rect_compressed",
    type: "camera",
    label: "Front camera",
  },
  {
    id: "/CAM_FRONT_LEFT/image_rect_compressed",
    type: "camera",
    label: "Front-left camera",
  },
  {
    id: "/CAM_FRONT_RIGHT/image_rect_compressed",
    type: "camera",
    label: "Front-right camera",
  },
  {
    id: "/CAM_BACK/image_rect_compressed",
    type: "camera",
    label: "Back camera",
  },
  {
    id: "/CAM_BACK_LEFT/image_rect_compressed",
    type: "camera",
    label: "Back-left camera",
  },
  {
    id: "/CAM_BACK_RIGHT/image_rect_compressed",
    type: "camera",
    label: "Back-right camera",
  },
  { id: "/LIDAR_TOP", type: "lidar", label: "Top lidar" },
  {
    id: "/CAM_FRONT/annotations",
    type: "image-annotation",
    label: "Front camera annotations",
  },
  {
    id: "/CAM_FRONT_LEFT/annotations",
    type: "image-annotation",
    label: "Front-left camera annotations",
  },
  {
    id: "/CAM_FRONT_RIGHT/annotations",
    type: "image-annotation",
    label: "Front-right camera annotations",
  },
  {
    id: "/CAM_BACK/annotations",
    type: "image-annotation",
    label: "Back camera annotations",
  },
  {
    id: "/CAM_BACK_LEFT/annotations",
    type: "image-annotation",
    label: "Back-left camera annotations",
  },
  {
    id: "/CAM_BACK_RIGHT/annotations",
    type: "image-annotation",
    label: "Back-right camera annotations",
  },
];

const CAMERA_SYNC_POLICY = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 120_000_000n,
} as const;

// Annotations arrive at ~2 Hz against ~12 Hz camera images. A 120ms
// tolerance leaves most ticks unresolved; widen the lookback so every
// tick has a current annotation message available for interpolation.
const ANNOTATION_SYNC_POLICY = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 1_500_000_000n,
} as const;

const NUSCENES_STREAM_POLICIES: McapStreamSyncPolicies = {
  "/CAM_FRONT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT_LEFT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT_RIGHT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_BACK/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_BACK_LEFT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_BACK_RIGHT/image_rect_compressed": CAMERA_SYNC_POLICY,
  "/CAM_FRONT/annotations": ANNOTATION_SYNC_POLICY,
  "/CAM_FRONT_LEFT/annotations": ANNOTATION_SYNC_POLICY,
  "/CAM_FRONT_RIGHT/annotations": ANNOTATION_SYNC_POLICY,
  "/CAM_BACK/annotations": ANNOTATION_SYNC_POLICY,
  "/CAM_BACK_LEFT/annotations": ANNOTATION_SYNC_POLICY,
  "/CAM_BACK_RIGHT/annotations": ANNOTATION_SYNC_POLICY,
  "/LIDAR_TOP": {
    mode: PlaybackSyncMode.LATEST,
    toleranceBeforeNs: 200_000_000n,
  },
};

const NUSCENES_INITIAL_TILES: Record<string, TilingTile> = {
  "camera-default": {
    title: "Camera",
    render: () => <McapCameraTile />,
  },
  "lidar-default": {
    title: "Lidar",
    render: () => <McapLidarTile />,
  },
};

/** Discoverable data sources in the scene. POC: fixed NuScenes set. */
export function useMcapSceneInventory(
  _fileName: string
): readonly SceneSource[] {
  return NUSCENES_SOURCES;
}

/** Per-topic synchronization policies for the file. POC: fixed NuScenes set. */
export function useMcapStreamPolicies(
  _fileName: string
): McapStreamSyncPolicies {
  return NUSCENES_STREAM_POLICIES;
}

/**
 * Default tile layout for a freshly-opened MCAP file. Each tile
 * auto-binds to the first source of its type in the scene inventory.
 */
export function useMcapInitialTiles(
  _fileName: string
): Record<string, TilingTile> {
  return NUSCENES_INITIAL_TILES;
}
