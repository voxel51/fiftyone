/**
 * Public decoder registry and decoder authoring contracts.
 */
export {
  DecoderRegistry,
  defaultDecoderRegistry,
  payloadDescriptorKey,
  resourceHintsForArrayBufferViews,
} from "./decoders";
export type { DecodeContext, Decoder } from "./decoders";
export type {
  DecodedAttributeValue,
  DecodedOutput,
  DecodedResourceHints,
  DecodedSourceTimestamps,
  DecodedTimeRange,
  DecodedTiming,
  DecodedVisualization,
  CameraVisualization,
  EncodedAv1VideoVisualization,
  EncodedH264VideoVisualization,
  EncodedImageVisualization,
  EncodedVideoVisualization,
  ImageVisualization,
  PayloadDescriptor,
  PointCloudField,
  PointCloudVisualization,
  RawImageDepthData,
  RawImageVisualization,
  SceneArrowPrimitive,
  SceneCubePrimitive,
  SceneCylinderPrimitive,
  SceneEntityDeletionKind,
  SceneEntityDeletionVisualization,
  SceneEntityVisualization,
  SceneLinePrimitive,
  SceneLinePrimitiveKind,
  SceneModelPrimitive,
  ScenePoint3d,
  ScenePose3d,
  SceneSpherePrimitive,
  SceneTextPrimitive,
  SceneTrianglePrimitive,
  SceneUpdateVisualization,
} from "./ir";

/**
 * Public visualization registry values shared by decoders and panels.
 */
export {
  RENDERER_FAMILY,
  VISUALIZATION_KIND,
  VISUALIZATION_RENDERER_REGISTRY,
} from "./visualization";
export type { RendererFamily, VisualizationKind } from "./visualization";

/**
 * Scene inventory — discoverable data sources for the current scene.
 */
export {
  SceneInventoryProvider,
  useSceneInventory,
  useSceneSourcesByType,
} from "./scene-inventory/react";
export type { SceneInventoryProviderProps } from "./scene-inventory/react";
export type { SceneSource } from "./scene-inventory";
