/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import type { EventBus } from "../event/EventBus";

/**
 * Configuration for a 2D scene.
 */
export interface Scene2DConfig {
  /** The canvas element to render to. */
  canvas: HTMLCanvasElement;
  /** The renderer to use. */
  renderer: Renderer2D;
  /** Resource loader for loading assets. */
  resourceLoader: ResourceLoader;
  /** Event bus for communication. */
  eventBus: EventBus;
}
