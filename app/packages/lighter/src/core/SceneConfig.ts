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
   * Per-label visibility, sourced from the sidebar's filters (confidence,
   * label value, tags) and hidden-labels set — the same predicate the looker
   * checked in `Overlay.isShown` (`overlays/base.ts`, `state.options.filter`).
   * `undefined` means unfiltered, matching every prior caller that never set
   * this and must keep painting everything.
   *
   * A label failing this is skipped at PAINT time only
   * (`Scene2D.shouldShowOverlay`); it stays registered and can still be
   * addressed by id. Hit-testing is a separate concern —
   * `InteractionManager`'s visibility predicate (set once from
   * `shouldShowOverlay` at construction, see `Scene2D`'s constructor) is what
   * keeps a filtered-out label from also being clickable at its last drawn
   * position.
   */
  filter?: (path: string, label: unknown) => boolean;
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
