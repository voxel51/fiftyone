/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { OverlayFactory } from "./overlay/OverlayFactory";

// Core exports
export { CoordinateSystem2D } from "./core/CoordinateSystem2D";
export { Scene2D } from "./core/Scene2D";
export type { Scene2DConfig } from "./core/SceneConfig";

// Renderer exports
export { MockRenderer2D } from "./renderer/MockRenderer2D";
export { PixiRenderer2D } from "./renderer/PixiRenderer2D";
export type { Renderer2D } from "./renderer/Renderer2D";

// Overlay exports
export type { BaseOverlay } from "./overlay/BaseOverlay";
export { DetectionOverlay } from "./overlay/DetectionOverlay";
export type {
  DetectionLabel,
  DetectionOverlayOptions,
} from "./overlay/DetectionOverlay";
export { ClassificationOverlay } from "./overlay/ClassificationOverlay";
export type { ClassificationOptions } from "./overlay/ClassificationOverlay";
export { ImageOverlay } from "./overlay/ImageOverlay";
export type { ImageOptions } from "./overlay/ImageOverlay";
export { KeypointOverlay } from "./overlay/KeypointOverlay";
export type { KeypointLabel, KeypointOptions } from "./overlay/KeypointOverlay";
export { OverlayFactory } from "./overlay/OverlayFactory";
export type { OverlayConstructor } from "./overlay/OverlayFactory";

// Pre-configured factory instance with built-in overlays
export const overlayFactory = OverlayFactory.createWithBuiltIns();

// Resource exports
export { globalPixiResourceLoader } from "./resource/GlobalPixiResourceLoader";
export { MockResourceLoader } from "./resource/MockResourceLoader";
export { PixiResourceLoader } from "./resource/PixiResourceLoader";
export type { ResourceLoader } from "./resource/ResourceLoader";

// Event exports
export type { LighterEventGroup } from "./events";

// Interaction exports
export { buildBrushCursor } from "./interaction/buildBrushCursor";
export type { BrushCursorOptions } from "./interaction/buildBrushCursor";
export { InteractionManager } from "./interaction/InteractionManager";
export type {
  InteractionHandler,
  OverlayEvent,
} from "./interaction/InteractionManager";
export { InteractiveDetectionHandler } from "./interaction/InteractiveDetectionHandler";
export { InteractiveKeypointHandler } from "./interaction/InteractiveKeypointHandler";

// Selection exports
export type { Selectable } from "./selection/Selectable";
export { SelectionManager } from "./selection/SelectionManager";
export type { SelectionOptions } from "./selection/SelectionManager";

// Command exports
export { MoveOverlayCommand } from "./commands/MoveOverlayCommand";
export { TransformOverlayCommand } from "./commands/TransformOverlayCommand";
export { UpdateLabelCommand } from "./commands/UpdateLabelCommand";

// Plugin exports
// TODO: PluginRegistry is currently unused - this needs to be hooked with fiftyone plugins
export { PluginRegistry } from "./plugin/PluginRegistry";

// React exports
export * from "./react";

// State exports
export * from "./state";

// Common types
export type {
  CanonicalMedia,
  CoordinateSystem,
  Dimensions,
  DrawStyle,
  Point,
  Rect,
  Spatial,
  TextOptions,
  TransformMatrix,
} from "./types";

export { getOverlayColor } from "./utils/colorMapping";
