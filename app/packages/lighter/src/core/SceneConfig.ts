/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

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
  /**
   * Automatically zoom to the bounding box of all spatial overlays on the first render 
   * tick after canonical media bounds and at least one spatial overlay are both available.
   */
  zoom?: boolean;
  /**
   * Fraction of the viewport to leave as empty space on each side when
   * applying auto-zoom. Defaults to 0 if not specified.
   */
  zoomPad?: number;
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
