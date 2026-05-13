// Re-exports for mock-stream factories used by demo stories. Import
// from "./utils" so the stories don't have to know individual file
// names — each factory returns a `MockStreamBundle` (see types.ts).

export type {
  MockStreamBundle,
  MockStreamFactoryOptions,
  MockStreamKind,
} from "./types";

export { DEFAULT_STREAM_CONFIGS } from "./default-stream-configs";

export {
  bundleToTrack,
  TRACK_COLOR_BY_KIND,
  tracksFromBundles,
} from "./track-utils";

export {
  createMockCameraStream,
  type MockCameraFrame,
  type MockCameraOptions,
} from "./mock-camera-stream";

export {
  createMockLidarStream,
  type MockLidarFrame,
  type MockLidarOptions,
} from "./mock-lidar-stream";

export {
  createMockSceneStream,
  type MockScenePose,
  type MockSceneOptions,
} from "./mock-scene-stream";

export {
  createMockGraphStream,
  type MockGraphSample,
  type MockGraphOptions,
} from "./mock-graph-stream";

export {
  createMockJsonStream,
  type MockJsonRecord,
  type MockJsonOptions,
} from "./mock-json-stream";

export { useMockStreams, type MockStreamConfig } from "./use-mock-streams";

export {
  MockStoryShell,
  type MockStoryShellProps,
  useMockBundles,
  useMockTracks,
  tileFromBundle,
} from "./MockStoryShell";
