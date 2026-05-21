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

const NUSCENES_SOURCES: readonly SceneSource[] = [
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

/**
 * Resolves the scene inventory for an MCAP file. POC: returns a fixed
 * NuScenes list regardless of `fileName`. The signature is the target
 * shape — a real implementation will inspect the file's channels.
 */
export function useMcapSceneInventory(
  _fileName: string
): readonly SceneSource[] {
  return useMemo(() => NUSCENES_SOURCES, []);
}

/**
 * Resolves per-topic synchronization policies for an MCAP file. POC:
 * returns the fixed NuScenes policy set regardless of `fileName`.
 */
export function useMcapStreamPolicies(
  _fileName: string
): McapStreamSyncPolicies {
  return useMemo(() => NUSCENES_STREAM_POLICIES, []);
}

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

/**
 * Default tile layout for a freshly-opened MCAP file. Each tile
 * auto-binds to the first source of its type in the scene inventory,
 * so the user sees a camera + lidar without picking anything.
 */
export function useMcapInitialTiles(
  _fileName: string
): Record<string, TilingTile> {
  return useMemo(() => NUSCENES_INITIAL_TILES, []);
}
