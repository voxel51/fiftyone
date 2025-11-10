/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { EventBus } from "../event/EventBus";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";

/**
 * Options for scene behavior and overlay management.
 */
export interface SceneOptions {
  /** Array of field paths that determine overlay visibility and rendering order */
  activePaths?: string[];
  /** Whether to show overlays */
  showOverlays?: boolean;
  /** Opacity for overlays */
  alpha?: number;
}

/**
 * Configuration for a 2D scene.
 *
 * The following can be imagined as being "injected" as dependencies.
 */
export interface Scene2DConfig {
  canvas: HTMLCanvasElement;
  renderer: Renderer2D;
  resourceLoader: ResourceLoader;
  eventBus: EventBus;
  options?: SceneOptions;
}
