import { VISUALIZATION_KIND } from "../visualization";
import type { PayloadDescriptor as ContractPayloadDescriptor } from "../schemas/v1";

/**
 * Scalar/object metadata emitted by decoders for inspection, filtering, and
 * lightweight renderer labels. Large binary payloads belong in `visualization`.
 */
export type DecodedAttributeValue =
  | string
  | number
  | boolean
  | bigint
  | null
  | readonly DecodedAttributeValue[]
  | { readonly [field: string]: DecodedAttributeValue };

/**
 * Encoded image bytes decoded from a message but still compressed as an image
 * format the browser can render directly.
 */
export interface EncodedImageVisualization {
  readonly kind: typeof VISUALIZATION_KIND.ENCODED_IMAGE;
  readonly bytes: Uint8Array;
  readonly mimeType?: string;
}

/**
 * Structured metadata for one source field packed into a point cloud message.
 */
export interface PointCloudField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

/**
 * A decoded per-point scalar channel that can drive point-cloud colouring.
 * Values must have length equal to the owning point cloud's pointCount.
 */
export interface PointCloudScalarField {
  readonly name: string;
  readonly values: Float32Array;
}

/**
 * Positions extracted from a point cloud into an interleaved x/y/z array.
 */
export interface PointCloudVisualization {
  /**
   * Per-message source coordinate frame decoded from the point cloud payload.
   */
  readonly coordinateFrameId?: string;
  /**
   * Optional interleaved per-point RGB colours in 0-1 components.
   * Length must equal 3 * pointCount.
   */
  readonly colors?: Float32Array;
  readonly kind: typeof VISUALIZATION_KIND.POINT_CLOUD;
  readonly fields: readonly PointCloudField[];
  readonly pointCount: number;
  readonly positions: Float32Array;
  /**
   * Optional canonical per-point sensor-return channels such as intensity/RCS.
   * Each scalar field's values array must have length equal to pointCount.
   */
  readonly scalarFields?: readonly PointCloudScalarField[];
}

/**
 * RGBA color in 0–1 components. Decoders normalize source colors into this
 * form so renderers do not need source-format awareness.
 */
export type RgbaColor = readonly [number, number, number, number];

/**
 * 3D position and orientation decoded from a Foxglove Pose.
 */
export interface ScenePose3D {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

/**
 * Cube / rectangular-prism primitive from a Foxglove SceneEntity.
 */
export interface SceneCubePrimitive {
  readonly color: RgbaColor | null;
  readonly pose: ScenePose3D;
  readonly size: readonly [number, number, number];
}

/**
 * SceneEntity decoded from a Foxglove SceneUpdate. A SceneEntity may contain
 * many primitive families; the first renderer slice draws cubes and preserves
 * counts for the rest so unsupported annotation pressure stays visible.
 */
export interface SceneEntityVisualization {
  readonly arrowCount: number;
  readonly cubeCount: number;
  readonly cubes: readonly SceneCubePrimitive[];
  readonly cylinderCount: number;
  readonly frameId?: string;
  readonly frameLocked: boolean;
  readonly id: string;
  readonly lineCount: number;
  readonly lifetimeNs?: bigint;
  readonly metadata: Readonly<Record<string, string>>;
  readonly modelCount: number;
  readonly sphereCount: number;
  readonly textCount: number;
  readonly timestampNs?: bigint;
  readonly triangleCount: number;
}

export type SceneEntityDeletionKind = "matching-id" | "all";

/**
 * SceneEntityDeletion decoded from a Foxglove SceneUpdate.
 */
export interface SceneEntityDeletionVisualization {
  readonly id: string;
  readonly timestampNs?: bigint;
  readonly type: SceneEntityDeletionKind;
}

/**
 * Renderer-neutral 3D scene update decoded from foxglove.SceneUpdate.
 */
export interface SceneUpdateVisualization {
  readonly kind: typeof VISUALIZATION_KIND.SCENE_UPDATE;
  readonly deletions: readonly SceneEntityDeletionVisualization[];
  readonly entities: readonly SceneEntityVisualization[];
}

/**
 * Filled circle annotation drawn in image pixel coordinates.
 */
export interface ImageAnnotationCircle {
  readonly position: readonly [number, number];
  readonly diameter: number;
  readonly thickness: number;
  readonly outlineColor: RgbaColor | null;
  readonly fillColor: RgbaColor | null;
}

/**
 * Polyline primitive kind packed into one Foxglove PointsAnnotation message.
 */
export type ImageAnnotationPointsKind =
  | "points"
  | "line-strip"
  | "line-loop"
  | "line-list";

/**
 * Points / line annotation in image pixel coordinates.
 */
export interface ImageAnnotationPoints {
  readonly type: ImageAnnotationPointsKind;
  readonly points: readonly (readonly [number, number])[];
  readonly thickness: number;
  readonly outlineColor: RgbaColor | null;
  readonly outlineColors: readonly RgbaColor[];
  readonly fillColor: RgbaColor | null;
}

/**
 * Text label drawn at a fixed image pixel position.
 */
export interface ImageAnnotationText {
  readonly position: readonly [number, number];
  readonly text: string;
  readonly fontSize: number;
  readonly textColor: RgbaColor | null;
  readonly backgroundColor: RgbaColor | null;
}

/**
 * Renderer-neutral 2D overlays for an image panel, decoded from a
 * foxglove.ImageAnnotations message.
 */
export interface ImageAnnotationsVisualization {
  readonly kind: typeof VISUALIZATION_KIND.IMAGE_ANNOTATIONS;
  readonly circles: readonly ImageAnnotationCircle[];
  readonly points: readonly ImageAnnotationPoints[];
  readonly texts: readonly ImageAnnotationText[];
}

/**
 * Decoder-owned visual artifact. Decoders may omit this for messages that only
 * contribute metadata, transforms, annotations, or other nonvisual state.
 */
export type DecodedVisualization =
  | EncodedImageVisualization
  | ImageAnnotationsVisualization
  | PointCloudVisualization
  | SceneUpdateVisualization;

/**
 * Encoded payload identity used by frontend decoder selection.
 */
export type PayloadDescriptor = Readonly<
  Pick<ContractPayloadDescriptor, "encoding" | "schema" | "schemaEncoding">
>;

/**
 * Time range for decoded data. Point samples may omit endNs; interval or
 * segment outputs can provide a natural end.
 */
export interface DecodedTimeRange {
  readonly startNs: bigint;
  readonly endNs?: bigint;
}

/**
 * Named timestamps preserved from the source container or message payload.
 */
export type DecodedSourceTimestamps = Readonly<Record<string, bigint>>;

/**
 * Runtime context passed to decoders by source adapters.
 */
export interface DecodeContext {
  readonly schemaData?: Uint8Array;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly streamId?: string;
  readonly timeRangeStartKey?: string;
  readonly timeRangeStartNs?: bigint;
  readonly [key: string]: unknown;
}

/**
 * Generic timing metadata for playback, synchronization, and provenance.
 */
export interface DecodedTiming {
  readonly timeRange?: DecodedTimeRange;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
}

/**
 * Decoder-provided resource metadata used by generic caches and worker transfer.
 */
export interface DecodedResourceHints {
  readonly sizeBytes?: number;
  readonly transferables?: readonly Transferable[];
}

/**
 * Structured decoder output for downstream playback and visualization.
 */
export interface DecodedOutput {
  readonly attributes?: Record<string, DecodedAttributeValue>;
  readonly resourceHints?: DecodedResourceHints;
  readonly timing?: DecodedTiming;
  readonly visualization?: DecodedVisualization;
}

/**
 * Frontend decoder implementation for a specific encoded payload.
 */
export interface Decoder {
  readonly id: string;
  readonly payload: PayloadDescriptor;
  readonly version: string;

  decode(bytes: Uint8Array, ctx: DecodeContext): DecodedOutput;
}
