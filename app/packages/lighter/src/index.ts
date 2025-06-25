/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

// Core exports
export { Scene2D } from "./core/Scene2D";
export type { Scene2DConfig } from "./core/SceneConfig";

// Renderer exports
export type { Renderer2D } from "./renderer/Renderer2D";
export { PixiRenderer2D } from "./renderer/PixiRenderer2D";

// Overlay exports
export type { BaseOverlay, OverlayStatus } from "./overlay/BaseOverlay";
export { BoundingBoxOverlay } from "./overlay/BoundingBoxOverlay";
export { ClassificationOverlay } from "./overlay/ClassificationOverlay";
export { OverlayFactory } from "./overlay/OverlayFactory";

// Resource exports
export type { ResourceLoader } from "./resource/ResourceLoader";
export { PixiResourceLoader } from "./resource/PixiResourceLoader";

// Event exports
export { EventBus } from "./event/EventBus";
export type { OverlayEvent } from "./event/EventBus";

// Undo/Redo exports
export type { Command } from "./undo/Command";
export { UndoRedoManager } from "./undo/UndoRedoManager";

// Plugin exports
export { PluginRegistry } from "./plugin/PluginRegistry";

// React exports
export * from "./react";

// Common types
export type { Rect, Point, DrawStyle, TextOptions } from "./types";
