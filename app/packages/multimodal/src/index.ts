/**
 * Public decoder registry and decoder authoring contracts.
 */
export {
  DecoderRegistry,
  defaultDecoderRegistry,
  payloadDescriptorKey,
  resourceHintsForArrayBufferViews,
} from "./decoders";
export type {
  DecodeContext,
  DecodedAttributeValue,
  DecodedOutput,
  DecodedResourceHints,
  DecodedSourceTimestamps,
  DecodedTimeRange,
  DecodedTiming,
  DecodedVisualization,
  Decoder,
  EncodedImageVisualization,
  PayloadDescriptor,
  PointCloudField,
  PointCloudVisualization,
  SceneCubePrimitive,
  SceneEntityDeletionKind,
  SceneEntityDeletionVisualization,
  SceneEntityVisualization,
  ScenePose3D,
  SceneUpdateVisualization,
} from "./decoders";

/**
 * Public visualization registry values shared by decoders and panels.
 */
export {
  PANEL_TYPE,
  VISUALIZATION_KIND,
  VISUALIZATION_PANEL_REGISTRY,
} from "./visualization";
export type { PanelType, VisualizationKind } from "./visualization";

/**
 * Scene inventory — discoverable data sources for the current scene.
 */
export {
  SceneInventoryProvider,
  useSceneInventory,
  useSceneSourcesByType,
} from "./scene-inventory";
export type {
  SceneInventoryProviderProps,
  SceneSource,
} from "./scene-inventory";
