// Re-exports for mock-stream factories used by demo stories. Import
// from "./utils" so the stories don't have to know individual file
// names — each factory returns a `MockStreamBundle` (see types.ts).

export type {
  MockStreamBundle,
  MockStreamFactoryOptions,
  MockStreamType,
} from "./types";

export { DEFAULT_STREAM_CONFIGS } from "./default-stream-configs";

export {
  DEFAULT_TRACKS,
  DEFAULT_PINNED_TRACK_IDS,
} from "./default-tracks";

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

export {
  useMockStreams,
  type MockStreamConfig,
  buildBundle,
} from "./use-mock-streams";

export { default as TileStory, type TileStoryProps } from "./TileStory";
