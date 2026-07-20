export type {
  CameraCalibrationRegionOfInterest,
  CameraCalibrationVisualization,
  DecodedAttributeValue,
  DecodedDiagnostic,
  DecodedFrame,
  DecodedOutput,
  DecodedResourceHints,
  DecodedSourceTimestamps,
  DecodedTimeRange,
  DecodedTiming,
  DecodedVisualization,
  EncodedH264VideoVisualization,
  EncodedImageVisualization,
  EncodedVideoVisualization,
  GridField,
  GridVisualization,
  ImageAnnotationCircle,
  ImageAnnotationPoints,
  ImageAnnotationPointsKind,
  ImageAnnotationsVisualization,
  ImageAnnotationText,
  ImageVisualization,
  LocationVisualization,
  PayloadDescriptor,
  PointCloudBounds,
  PointCloudField,
  PointCloudNumericRange,
  PointCloudRenderPayload,
  PointCloudRenderScalarField,
  PointCloudScalarField,
  PointCloudVisualization,
  PoseVisualization,
  RawImageDepthData,
  RawImageVisualization,
  RgbaColor,
  ScalarSample,
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneEntityDeletionKind,
  SceneEntityDeletionVisualization,
  SceneEntityVisualization,
  SceneLinePrimitive,
  SceneLinePrimitiveKind,
  SceneModelPrimitive,
  ScenePoint3D,
  ScenePose3D,
  SceneSpherePrimitive,
  SceneTextPrimitive,
  SceneTrianglePrimitive,
  SceneUpdateVisualization,
  TransformSample,
} from "../ir";

import type {
  DecodedOutput,
  DecodedSourceTimestamps,
  PayloadDescriptor,
} from "../ir";

/** Runtime context passed to payload decoders by format adapters. */
export interface DecodeContext {
  readonly schemaData?: Uint8Array;
  readonly sourceTimestamps?: DecodedSourceTimestamps;
  readonly streamId?: string;
  readonly timeRangeStartKey?: string;
  readonly timeRangeStartNs?: bigint;
  readonly [key: string]: unknown;
}

/** Frontend decoder implementation for one encoded payload family. */
export interface Decoder {
  readonly id: string;
  readonly payload: PayloadDescriptor;
  readonly version: string;

  decode(bytes: Uint8Array, ctx: DecodeContext): DecodedOutput;
}
