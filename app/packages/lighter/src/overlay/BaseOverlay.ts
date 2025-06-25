/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Renderer2D } from "../renderer/Renderer2D";
import type { EventBus } from "../event/EventBus";

/**
 * Status of an overlay in the rendering pipeline.
 */
export type OverlayStatus = "pending" | "decoded" | "painting" | "painted";

/**
 * Base interface for all overlays.
 */
export interface BaseOverlay {
  /** Unique identifier for the overlay. */
  readonly id: string;
  /** Display name of the overlay. */
  name: string;
  /** Tags for categorizing the overlay. */
  tags: string[];
  /** Current status in the rendering pipeline. */
  status: OverlayStatus;

  /**
   * Sets the renderer for this overlay.
   * @param renderer - The renderer to use.
   */
  setRenderer(renderer: Renderer2D): void;

  /**
   * Renders the overlay using the provided renderer.
   * @param renderer - The renderer to use for drawing.
   */
  render(renderer: Renderer2D): void;

  /**
   * Attaches the event bus to this overlay.
   * @param bus - The event bus to attach.
   */
  attachEventBus(bus: EventBus): void;
}
