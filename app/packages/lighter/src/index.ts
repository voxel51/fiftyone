/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

// Core types and interfaces
export * from "./types";

// Core classes
export * from "./core/events";
export * from "./core/scene";

// Overlays
export * from "./overlays/base";
export * from "./overlays/bounding-box";
export * from "./overlays/classification";

// Rendering
export * from "./rendering/strategies";

// Resources
export * from "./resources/loader";

// Factories
export * from "./factories/overlay-factory";

// Undo/Redo
export * from "./undo/undo-redo-manager";

// Convenience exports for common use cases
export { Scene2D, Scene3D, type SceneConfig } from "./core/scene";

export {
  LighterEventBus,
  OVERLAY_LOADED_EVENT,
  OVERLAY_ERROR_EVENT,
  OVERLAY_UPDATED_EVENT,
  UNDO_EVENT,
  REDO_EVENT,
} from "./core/events";

export {
  DefaultRenderStrategy2D,
  StubRenderStrategy3D,
} from "./rendering/strategies";

export { DefaultResourceLoader, MockResourceLoader } from "./resources/loader";

export {
  createOverlay,
  registerOverlayFactory,
  overlayFactoryRegistry,
} from "./factories/overlay-factory";
