import { VISUALIZATION_KIND } from "./visualization-kinds";

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

/** Full-precision depth samples retained alongside a display-ready raw image. */
export interface RawImageDepthData {
  /** Converts one stored sample into meters. */
  readonly metersPerUnit: number;
  /** Contiguous row-major samples from the source image's top-left pixel. */
  readonly values: Uint16Array | Float32Array;
}

interface BaseEncodedVideoVisualization {
  readonly kind: typeof VISUALIZATION_KIND.ENCODED_VIDEO;
  readonly bytes: Uint8Array;
  readonly coordinateFrameId?: string;
  readonly format: string;
  readonly keyframe?: boolean;
  readonly timestampNs?: bigint;
}

/**
 * Encoded H.264 access unit decoded from one message.
 */
export interface EncodedH264VideoVisualization extends BaseEncodedVideoVisualization {
  readonly codec: "h264";
  readonly h264: {
    readonly codecString?: string;
    readonly hasFrame?: boolean;
    readonly pps?: Uint8Array;
    readonly sps?: Uint8Array;
  };
}

/**
 * Encoded video access unit decoded from one record. The contract lets source
 * streams be classified as image-family streams while keeping codec metadata
 * aligned with the selected codec.
 */
export type EncodedVideoVisualization =
  | EncodedH264VideoVisualization
  | (BaseEncodedVideoVisualization & {
      readonly codec: "av1" | "h265" | "vp9";
      readonly h264?: never;
    });

/**
 * Raw image pixels normalized by a decoder into display-ready RGBA.
 * `rgba` is row-major from the source image's top-left pixel.
 */
export interface RawImageVisualization {
  readonly kind: typeof VISUALIZATION_KIND.RAW_IMAGE;
  /**
   * Per-message source coordinate frame decoded from the image header.
   */
  readonly coordinateFrameId?: string;
  readonly depth?: RawImageDepthData;
  readonly height: number;
  readonly rgba: Uint8Array;
  readonly sourceEncoding: string;
  readonly timestampNs?: bigint;
  readonly width: number;
}

/**
 * Image-like visualizations rendered by the multimodal image panel.
 */
export type ImageVisualization =
  | EncodedVideoVisualization
  | EncodedImageVisualization
  | RawImageVisualization;

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
 * Inclusive numeric range computed from finite point-cloud values.
 */
export interface PointCloudNumericRange {
  readonly max: number;
  readonly min: number;
}

/**
 * Axis-aligned bounds computed from every finite point in a decoded cloud.
 */
export interface PointCloudBounds {
  readonly max: readonly [number, number, number];
  readonly min: readonly [number, number, number];
}

/**
 * Sampled values and full-cloud statistics for one decoded scalar channel.
 * Values belonging to non-finite positions are excluded from the range so it
 * describes renderable points.
 */
export interface PointCloudRenderScalarField {
  readonly finiteValueCount: number;
  readonly name: string;
  readonly range: PointCloudNumericRange | null;
  /** Capacity-sized values aligned with the sampled render positions. */
  readonly values: Float32Array;
}

/**
 * Decoder-prepared point data shared by point-cloud renderers. The first
 * `sampledPointCount` entries contain only finite positions; `sourceIndices`
 * maps each sample back to the corresponding point in the full decoded arrays.
 */
export interface PointCloudRenderPayload {
  readonly bounds: PointCloudBounds | null;
  /** Allocated point capacity shared by every typed array in this payload. */
  readonly capacity: number;
  readonly colors?: Float32Array;
  readonly finitePointCount: number;
  readonly heightRange: PointCloudNumericRange | null;
  readonly positions: Float32Array;
  readonly sampledPointCount: number;
  readonly scalarFields: readonly PointCloudRenderScalarField[];
  readonly sourceIndices: Uint32Array;
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
   * Optional bounded, finite render data and full-cloud statistics prepared by
   * the decoder. Full arrays remain available above for inspection and other
   * consumers that require every decoded point.
   */
  readonly renderPayload?: PointCloudRenderPayload;
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
  /** ROS CameraInfo horizontal binning; zero means no binning. */
  readonly binningX?: number;
  /** ROS CameraInfo vertical binning; zero means no binning. */
  readonly binningY?: number;
  readonly width: number;
  readonly height: number;
  readonly K: readonly number[];
  readonly R?: readonly number[];
  readonly P?: readonly number[];
  readonly distortionModel?: string;
  readonly D?: readonly number[];
  /** ROS CameraInfo sensor-space crop, when the source schema provides it. */
  readonly roi?: CameraCalibrationRegionOfInterest;
  readonly timestampNs?: bigint;
}

/** Sensor-space crop carried by ROS CameraInfo calibration messages. */
export interface CameraCalibrationRegionOfInterest {
  readonly doRectify: boolean;
  readonly height: number;
  readonly width: number;
  readonly xOffset: number;
  readonly yOffset: number;
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
  /** ROS NavSatStatus.status when present; -1 means no fix. */
  readonly fixStatus?: number;
  /** ROS NavSatStatus.service bitmask when present. */
  readonly fixService?: number;
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
  | ImageVisualization
  | GridVisualization
  | ImageAnnotationsVisualization
  | LocationVisualization
  | PointCloudVisualization
  | PoseVisualization
  | SceneUpdateVisualization;

/**
 * Encoded payload identity used by frontend decoder selection.
 */
export interface PayloadDescriptor {
  readonly encoding: string;
  readonly schema?: string;
  readonly schemaEncoding?: string;
}

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
 * One coordinate-frame transform carried as renderer-neutral frame data.
 */
export interface TransformSample {
  readonly childFrameId: string;
  readonly parentFrameId: string;
  readonly quaternion: readonly [number, number, number, number];
  /** Omitted for static transforms that are valid for the whole episode. */
  readonly timestampNs?: bigint;
  readonly translation: readonly [number, number, number];
}

/** One numeric observation emitted by a scalar or telemetry stream. */
export interface ScalarSample {
  readonly field?: string;
  readonly timestampNs: bigint;
  readonly unit?: string;
  readonly value: number;
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

/** A successful decode's bounded capability or quality diagnostic. */
export interface DecodedDiagnostic {
  readonly capability?: string;
  readonly code: string;
  readonly message: string;
  readonly severity: "info" | "warning";
}

/**
 * Structured decoder output for downstream playback and visualization.
 */
export interface DecodedOutput {
  readonly attributes?: Record<string, DecodedAttributeValue>;
  readonly diagnostics?: readonly DecodedDiagnostic[];
  readonly resourceHints?: DecodedResourceHints;
  readonly scalars?: readonly ScalarSample[];
  readonly timing?: DecodedTiming;
  readonly transforms?: readonly TransformSample[];
  readonly visualization?: DecodedVisualization;
}

/**
 * One decoded frame addressed through the format-neutral episode port.
 */
export interface DecodedFrame {
  readonly output: DecodedOutput;
  readonly sequence?: number;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly streamId: string;
  readonly timestampNs: bigint;
}
