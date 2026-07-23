import type {
  CameraCalibrationVisualization,
  PayloadDescriptor,
} from "./frames";
import type { TimeDomain, TimeWindow } from "./time";

/** Stable identity of a stream within an episode. */
export type StreamId = string;

/** Renderer-level family exposed by one episode stream. */
export const STREAM_KIND = Object.freeze({
  CAMERA_CALIBRATION: "camera-calibration",
  GRID: "grid",
  IMAGE: "image",
  IMAGE_ANNOTATIONS: "image-annotations",
  LOCATION: "location",
  LOG: "log",
  POINT_CLOUD: "point-cloud",
  POSE: "pose",
  SCALAR: "scalar",
  SCENE_UPDATE: "scene-update",
  TRANSFORM: "transform",
  UNKNOWN: "unknown",
  VIDEO: "video",
} as const);

/** Closed union of renderer-level stream families. */
export type StreamKind = (typeof STREAM_KIND)[keyof typeof STREAM_KIND];

/** Semantic source families consumed by the shared scene views. */
export const SCENE_SOURCE_TYPE = Object.freeze({
  CAMERA_CALIBRATION: "camera-calibration",
  IMAGE: "image",
  IMAGE_ANNOTATION: "image-annotation",
  LOCATION: "location",
  LOG: "log",
  MAP_LAYER: "map-layer",
  POINT_CLOUD: "point-cloud",
  POSE: "pose",
  SCENE_ANNOTATION: "scene-annotation",
} as const);

/** Closed union of semantic source families understood by scene views. */
export type SceneSourceType =
  (typeof SCENE_SOURCE_TYPE)[keyof typeof SCENE_SOURCE_TYPE];

/** Well-known renderer-neutral scene-source metadata keys. */
export const SCENE_SOURCE_METADATA = Object.freeze({
  CALIBRATION_STREAM_ID: "scene.calibration_stream_id",
  SOURCE_NAME: "scene.source_name",
  TYPE: "scene.source_type",
} as const);

/** Well-known adapter-normalized metadata keys used by generic inventories. */
export const STREAM_METADATA = Object.freeze({
  DECODE_STATUS: "stream.decode_status",
  ENCODING: "stream.encoding",
  SCHEMA_NAME: "stream.schema_name",
} as const);

/** One static coordinate-frame relationship declared by a manifest. */
export interface TransformTopologyEdge {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly sourceStreamId?: StreamId;
}

/** Static coordinate-frame graph declared by an episode. */
export interface TransformTopology {
  readonly edges: readonly TransformTopologyEdge[];
}

/** One discoverable renderer-neutral stream in an episode. */
export interface StreamDescriptor {
  readonly approxRateHz?: number;
  readonly coordinateFrameId?: string;
  readonly count?: number;
  readonly id: StreamId;
  readonly kind: StreamKind;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly payload: PayloadDescriptor;
  readonly sourceName: string;
  readonly timeRange: TimeWindow;
}

/** Lightweight renderer-facing source derived from a stream manifest. */
export interface SceneSource {
  readonly id: StreamId;
  readonly label: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly recordCount?: number;
  /** Format-native name used for display and semantic stream-name matching. */
  readonly sourceName: string;
  /**
   * Semantic family understood by a renderer. Known shared families use
   * `SceneSourceType`; adapters may also publish extension families that
   * generic views safely ignore.
   */
  readonly type: string;
}

/** Static calibration value associated with a stream. */
export interface StreamCalibration {
  readonly calibration: CameraCalibrationVisualization;
  readonly streamId: StreamId;
}

/** Cloneable inventory returned when an episode session opens. */
export interface EpisodeManifest {
  readonly calibrations?: readonly StreamCalibration[];
  readonly episodeId: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly streams: readonly StreamDescriptor[];
  readonly timeDomain: TimeDomain;
  readonly timeRange: TimeWindow;
  readonly transformTopology?: TransformTopology;
}
