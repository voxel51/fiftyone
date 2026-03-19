/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import type { Rect } from "../types";

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
  /** Automatically zoom to content */
  zoom?: boolean;
  /** Padding applied when auto-zooming to content. Defaults to 0. */
  zoomPad?: number;
  /**
   * Pre-computed zoom target in normalized [0,1] coordinates relative to the
   * canonical media. When provided alongside `zoom: true`, Scene2D will apply
   * the zoom as soon as image dimensions are known, without waiting for spatial
   * overlay objects to be added to the scene.
   */
  zoomTarget?: Rect;
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
  sceneId: string;
  options?: SceneOptions;
}
