import type {
  CameraCalibrationVisualization,
  PayloadDescriptor,
} from "./frames";
import type { ByteSourceReadProfile } from "./bytes";
import type { TimeDomain, TimeWindow } from "./time";

/** Stable identity of a stream within an episode. */
export type StreamId = string;

/** Renderer-level family exposed by one episode stream. */
export const STREAM_KIND = Object.freeze({
  AUDIO: "audio",
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
  AUDIO: "audio",
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

/** Aggregate application support for every stream in one recording. */
export interface EpisodeRecordingSupportFacts {
  readonly inspectableStreamCount: number;
  readonly renderableStreamCount: number;
  readonly unavailableStreamCount: number;
}

/** Coverage of embedded schemas across a recording's channels. */
export interface EpisodeRecordingSchemaCoverage {
  readonly embeddedSchemaChannelCount: number;
  readonly missingSchemaChannelCount: number;
}

/** Aggregate storage facts for one MCAP compression codec. */
export interface McapCompressionFacts {
  readonly chunkCount: number;
  readonly codec: string;
  readonly compressedBytes: string;
  readonly uncompressedBytes: string;
}

/** Attachment identity retained by the MCAP summary index. */
export interface McapAttachmentFacts {
  readonly dataSizeBytes: string;
  readonly mediaType: string;
  readonly name: string;
}

/** Message-index coverage across the MCAP's non-empty chunks. */
export type McapMessageIndexStatus =
  | "absent"
  | "complete"
  | "partial"
  | "unknown";

/** MCAP-specific facts computed only from the initialized reader summary. */
export interface McapRecordingFacts {
  readonly attachmentCount?: number;
  readonly attachments?: readonly McapAttachmentFacts[];
  readonly chunkCount?: number;
  readonly compression?: readonly McapCompressionFacts[];
  readonly compressionRatio?: number;
  readonly library?: string;
  readonly medianChannelsPerChunk?: number;
  readonly medianChunkSizeBytes?: string;
  readonly medianChunkSpanNs?: string;
  readonly messageIndexStatus?: McapMessageIndexStatus;
  readonly metadataRecordCount?: number;
  readonly metadataRecordNames?: readonly string[];
  readonly profile?: string;
}

/** Immutable episode-wide recording facts safe to clone across workers. */
export interface EpisodeRecordingFacts {
  readonly applicationSupport?: EpisodeRecordingSupportFacts;
  readonly channelCount?: number;
  readonly durationNs?: string;
  readonly endTimeNs?: string;
  readonly format: string;
  readonly mcap?: McapRecordingFacts;
  readonly messageCount?: string;
  readonly readProfile?: ByteSourceReadProfile;
  readonly schemaCount?: number;
  readonly schemaCoverage?: EpisodeRecordingSchemaCoverage;
  readonly sizeBytes?: string;
  readonly startTimeNs?: string;
  readonly topicCount?: number;
}

/** Cloneable inventory returned when an episode session opens. */
export interface EpisodeManifest {
  readonly calibrations?: readonly StreamCalibration[];
  readonly episodeId: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly recordingFacts?: EpisodeRecordingFacts;
  readonly streams: readonly StreamDescriptor[];
  readonly timeDomain: TimeDomain;
  readonly timeRange: TimeWindow;
  readonly transformTopology?: TransformTopology;
}
