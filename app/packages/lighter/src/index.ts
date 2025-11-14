/**
 * Copyright 2017-2025, Voxel51, Inc.
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
export { BoundingBoxOverlay } from "./overlay/BoundingBoxOverlay";
export type { BoundingBoxOptions } from "./overlay/BoundingBoxOverlay";
export { ClassificationOverlay } from "./overlay/ClassificationOverlay";
export type { ClassificationOptions } from "./overlay/ClassificationOverlay";
export { ImageOverlay } from "./overlay/ImageOverlay";
export type { ImageOptions } from "./overlay/ImageOverlay";
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
export { EventBus, LIGHTER_EVENTS } from "./event/EventBus";
export type {
  LighterEvent as OverlayEvent,
  LighterEventDetail as OverlayEventDetail,
} from "./event/EventBus";

// Interaction exports
export { InteractionManager } from "./interaction/InteractionManager";
export type { InteractionHandler } from "./interaction/InteractionManager";
export { InteractiveDetectionHandler } from "./interaction/InteractiveDetectionHandler";

// Selection exports
export type { Selectable } from "./selection/Selectable";
export { SelectionManager } from "./selection/SelectionManager";
export type { SelectionOptions } from "./selection/SelectionManager";

// Undo/Redo exports
export type { Command } from "./commands/Command";
export { MoveOverlayCommand } from "./commands/MoveOverlayCommand";
export type { Movable } from "./commands/MoveOverlayCommand";
export { TransformOverlayCommand } from "./commands/TransformOverlayCommand";
export { UndoRedoManager } from "./commands/UndoRedoManager";
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
