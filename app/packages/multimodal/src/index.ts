/**
 * Public app hooks for source-agnostic multimodal server artifacts.
 */
export { usePlaybackPlan, useSceneInventory } from "./client/hooks";
export type { MultimodalQueryState } from "./client/hooks";

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
