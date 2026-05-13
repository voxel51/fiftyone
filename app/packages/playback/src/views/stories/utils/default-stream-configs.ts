import type { MockStreamConfig } from "./use-mock-streams";

/**
 * Default stream set used by demo stories that don't need anything
 * specific. Covers one of each tile kind so the multi-modal layout is
 * fully populated out of the box.
 *
 * Stories that want a different mix just pass their own
 * `MockStreamConfig[]` to `<MockStoryShell configs={…}>`.
 */
export const DEFAULT_STREAM_CONFIGS: MockStreamConfig[] = [
  {
    kind: "camera",
    id: "camera_front",
    title: "Camera front",
    duration: 12,
    fps: 30,
  },
  {
    kind: "lidar",
    id: "lidar_top",
    title: "Lidar top",
    duration: 12,
    hz: 10,
  },
  {
    kind: "scene",
    id: "scene_world",
    title: "Scene",
    duration: 12,
  },
  {
    kind: "graph",
    id: "imu",
    title: "IMU",
    duration: 12,
    hz: 50,
  },
  {
    kind: "json",
    id: "metadata",
    title: "Metadata",
    duration: 12,
    hz: 10,
  },
];
