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
 * Structured metadata for one source field packed into a grid message.
 */
export interface GridField {
  readonly name: string;
  readonly offset: number;
  readonly type: number;
}

/**
 * A 2D data grid rendered as a textured plane in a 3D scene (occupancy
 * grids, semantic maps, drivable areas). `pose` places the grid's origin
 * corner in `coordinateFrameId`; cells extend row-major from that corner
 * with +x spanning columns and +y spanning rows. `rgba` holds
 * `columnCount * rowCount * 4` bytes, row 0 first — decoders normalize
 * source layouts (channel order, scalar fields) into straight RGBA so
 * renderers stay source-format agnostic.
 */
export interface GridVisualization {
  readonly kind: typeof VISUALIZATION_KIND.GRID;
  /**
   * Per-message source coordinate frame decoded from the grid payload.
   */
  readonly coordinateFrameId?: string;
  /**
   * Cell footprint in meters along the grid-local x (column) and y (row)
   * axes.
   */
  readonly cellSize: readonly [number, number];
  readonly columnCount: number;
  readonly rowCount: number;
  readonly pose: ScenePose3D;
  readonly rgba: Uint8Array;
  readonly timestampNs?: bigint;
}

/**
 * Camera intrinsics and projection decoded from a calibration message.
 * Matrices are row-major: `K` is the 3x3 intrinsic matrix, `R` the 3x3
 * rectification matrix, `P` the 3x4 projection matrix. Only `K` is
 * guaranteed; exporters routinely omit `R`/`P`/distortion. The camera
 * convention is OpenCV/Foxglove: +Z forward, +X right, +Y down, with
 * pixel (0,0) at the image's top-left corner.
 */
export interface CameraCalibrationVisualization {
  readonly kind: typeof VISUALIZATION_KIND.CAMERA_CALIBRATION;
  /**
   * Per-message source coordinate frame decoded from the calibration
   * payload (the camera's frame).
   */
  readonly coordinateFrameId?: string;
  readonly width: number;
  readonly height: number;
  readonly K: readonly number[];
  readonly R?: readonly number[];
  readonly P?: readonly number[];
  readonly distortionModel?: string;
  readonly D?: readonly number[];
  readonly timestampNs?: bigint;
}

/**
 * A geographic fix (GPS/GNSS) decoded from a location message. Angles are
 * degrees (WGS84), altitude meters. `positionCovariance` is the row-major
 * 3x3 ENU covariance when the source carries one.
 */
export interface LocationVisualization {
  readonly kind: typeof VISUALIZATION_KIND.LOCATION;
  /**
   * Per-message source coordinate frame of the reporting sensor.
   */
  readonly coordinateFrameId?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly altitude?: number;
  readonly positionCovariance?: readonly number[];
  readonly timestampNs?: bigint;
}

/**
 * A single pose sample from an ego/robot pose stream, normalized across
 * source schemas (Foxglove PoseInFrame, JSON odometry exports). Position
 * and orientation are expressed in `coordinateFrameId` when the source
 * declares one; kinematics are optional and kept only when the source
 * carries them (velocity/acceleration in the body frame for odometry-style
 * streams).
 */
export interface PoseVisualization {
  readonly kind: typeof VISUALIZATION_KIND.POSE;
  /**
   * Per-message source coordinate frame the pose is expressed in.
   */
  readonly coordinateFrameId?: string;
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
  readonly velocity?: readonly [number, number, number];
  readonly acceleration?: readonly [number, number, number];
  readonly angularVelocity?: readonly [number, number, number];
  readonly timestampNs?: bigint;
}

/**
 * 3D position and orientation normalized for FiftyOne scene rendering.
 */
export interface ScenePose3D {
  readonly position: readonly [number, number, number];
  readonly quaternion: readonly [number, number, number, number];
}

export type ScenePoint3D = readonly [number, number, number];

/**
 * Arrow primitive. Arrows point along the local +X axis before `pose` is
 * applied.
 */
export interface SceneArrowPrimitive {
  readonly color: RgbaColor | null;
  readonly headDiameter: number;
  readonly headLength: number;
  readonly pose: ScenePose3D;
  readonly shaftDiameter: number;
  readonly shaftLength: number;
}

/**
 * Cube / rectangular-prism primitive.
 */
export interface SceneCubePrimitive {
  readonly color: RgbaColor | null;
  readonly pose: ScenePose3D;
  readonly size: readonly [number, number, number];
}

/**
 * Cylinder primitive. The cylinder's height is its local Z dimension before
 * `pose` is applied.
 */
export interface SceneCylinderPrimitive {
  readonly bottomScale: number;
  readonly color: RgbaColor | null;
  readonly pose: ScenePose3D;
  readonly size: readonly [number, number, number];
  readonly topScale: number;
}

export type SceneLinePrimitiveKind = "line-strip" | "line-loop" | "line-list";

/**
 * Polyline primitive.
 */
export interface SceneLinePrimitive {
  readonly color: RgbaColor | null;
  readonly colors: readonly RgbaColor[];
  readonly indices: readonly number[];
  readonly points: readonly ScenePoint3D[];
  readonly pose: ScenePose3D;
  readonly scaleInvariant: boolean;
  readonly thickness: number;
  readonly type: SceneLinePrimitiveKind;
}

/**
 * External or embedded 3D model primitive.
 */
export interface SceneModelPrimitive {
  readonly color: RgbaColor | null;
  readonly data?: Uint8Array;
  readonly mediaType: string;
  readonly overrideColor: boolean;
  readonly pose: ScenePose3D;
  readonly scale: readonly [number, number, number];
  readonly url: string;
}

/**
 * Sphere / ellipsoid primitive.
 */
export interface SceneSpherePrimitive {
  readonly color: RgbaColor | null;
  readonly pose: ScenePose3D;
  readonly size: readonly [number, number, number];
}

/**
 * Text label primitive.
 */
export interface SceneTextPrimitive {
  readonly billboard: boolean;
  readonly color: RgbaColor | null;
  readonly fontSize: number;
  readonly pose: ScenePose3D;
  readonly scaleInvariant: boolean;
  readonly text: string;
}

/**
 * Triangle-list mesh primitive.
 */
export interface SceneTrianglePrimitive {
  readonly color: RgbaColor | null;
  readonly colors: readonly RgbaColor[];
  readonly indices: readonly number[];
  readonly points: readonly ScenePoint3D[];
  readonly pose: ScenePose3D;
}

/**
 * Logical scene entity. An entity may contain many primitive families. Counts
 * are preserved as explicit metadata so inspectors can show source pressure
 * without walking render arrays.
 */
export interface SceneEntityVisualization {
  readonly arrowCount: number;
  readonly arrows: readonly SceneArrowPrimitive[];
  readonly cubeCount: number;
  readonly cubes: readonly SceneCubePrimitive[];
  readonly cylinderCount: number;
  readonly cylinders: readonly SceneCylinderPrimitive[];
  readonly frameId?: string;
  readonly frameLocked: boolean;
  readonly id: string;
  readonly lineCount: number;
  readonly lines: readonly SceneLinePrimitive[];
  readonly lifetimeNs?: bigint;
  readonly metadata: Readonly<Record<string, string>>;
  readonly modelCount: number;
  readonly models: readonly SceneModelPrimitive[];
  readonly sphereCount: number;
  readonly spheres: readonly SceneSpherePrimitive[];
  readonly textCount: number;
  readonly texts: readonly SceneTextPrimitive[];
  readonly timestampNs?: bigint;
  readonly triangleCount: number;
  readonly triangles: readonly SceneTrianglePrimitive[];
}

export type SceneEntityDeletionKind = "matching-id" | "all";

/**
 * Scene entity deletion.
 */
export interface SceneEntityDeletionVisualization {
  readonly id: string;
  readonly timestampNs?: bigint;
  readonly type: SceneEntityDeletionKind;
}

/**
 * Renderer-neutral 3D scene update.
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
  | CameraCalibrationVisualization
  | EncodedImageVisualization
  | GridVisualization
  | ImageAnnotationsVisualization
  | LocationVisualization
  | PointCloudVisualization
  | PoseVisualization
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
