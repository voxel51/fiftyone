import type { TilingTile } from "@fiftyone/tiling";
import { useMemo } from "react";
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

const NUSCENES_CAMERA_FRONT: SceneSource = {
  id: "/CAM_FRONT/image_rect_compressed",
  type: "camera",
  label: "Front camera",
};

const NUSCENES_LIDAR_TOP: SceneSource = {
  id: "/LIDAR_TOP",
  type: "lidar",
  label: "Top lidar",
};

const NUSCENES_SOURCES: readonly SceneSource[] = [
  NUSCENES_CAMERA_FRONT,
  { id: "/CAM_FRONT_LEFT/image_rect_compressed", type: "camera", label: "Front-left camera" },
  { id: "/CAM_FRONT_RIGHT/image_rect_compressed", type: "camera", label: "Front-right camera" },
  { id: "/CAM_BACK/image_rect_compressed", type: "camera", label: "Back camera" },
  { id: "/CAM_BACK_LEFT/image_rect_compressed", type: "camera", label: "Back-left camera" },
  { id: "/CAM_BACK_RIGHT/image_rect_compressed", type: "camera", label: "Back-right camera" },
  NUSCENES_LIDAR_TOP,
];

const CAMERA_SYNC_POLICY = {
  mode: PlaybackSyncMode.LATEST,
  toleranceBeforeNs: 120_000_000n,
} as const;

const NUSCENES_STREAM_POLICIES: McapStreamSyncPolicies = {
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

// One front camera + lidar visible on open. The topic is threaded into
// the tile body via the render closure.
const NUSCENES_INITIAL_TILES: Record<string, TilingTile> = {
  [`${NUSCENES_CAMERA_FRONT.id}-1`]: {
    title: NUSCENES_CAMERA_FRONT.label,
    render: () => <McapCameraTile topic={NUSCENES_CAMERA_FRONT.id} />,
  },
  [`${NUSCENES_LIDAR_TOP.id}-1`]: {
    title: NUSCENES_LIDAR_TOP.label,
    render: () => <McapLidarTile topic={NUSCENES_LIDAR_TOP.id} />,
  },
};

/** Discoverable data sources in the scene. POC: fixed NuScenes set. */
export function useMcapSceneInventory(
  _fileName: string
): readonly SceneSource[] {
  return useMemo(() => NUSCENES_SOURCES, []);
}

/** Per-topic synchronization policies for the file. POC: fixed NuScenes set. */
export function useMcapStreamPolicies(
  _fileName: string
): McapStreamSyncPolicies {
  return useMemo(() => NUSCENES_STREAM_POLICIES, []);
}

/** Default tile layout for a freshly-opened MCAP file. */
export function useMcapInitialTiles(
  _fileName: string
): Record<string, TilingTile> {
  return useMemo(() => NUSCENES_INITIAL_TILES, []);
}
