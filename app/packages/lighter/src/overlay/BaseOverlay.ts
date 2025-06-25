/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";

/**
 * Base abstract class for all overlays.
 */
export abstract class BaseOverlay {
  /** Unique identifier for the overlay. */
  readonly id: string;
  /** Display name of the overlay. */
  name: string;
  /** Tags for categorizing the overlay. */
  tags: string[];

  /** The renderer instance. */
  protected renderer?: Renderer2D;
  /** The event bus for communication. */
  protected eventBus?: EventBus;
  /** The resource loader for loading assets. */
  protected resourceLoader?: ResourceLoader;

  constructor(id: string, name: string, tags: string[] = []) {
    this.id = id;
    this.name = name;
    this.tags = tags;
  }

  /**
   * Sets the renderer for this overlay.
   * @param renderer - The renderer to use.
   */
  setRenderer(renderer: Renderer2D): void {
    this.renderer = renderer;
  }

  /**
   * Attaches the event bus to this overlay.
   * @param bus - The event bus to attach.
   */
  attachEventBus(bus: EventBus): void {
    this.eventBus = bus;
    // Listen for undo/redo events
    bus.on(LIGHTER_EVENTS.UNDO, () => {
      // Handle undo if needed
    });
    bus.on(LIGHTER_EVENTS.REDO, () => {
      // Handle redo if needed
    });
  }

  /**
   * Sets the resource loader for this overlay.
   * @param loader - The resource loader to use.
   */
  setResourceLoader(loader: ResourceLoader): void {
    this.resourceLoader = loader;
  }

  /**
   * Renders the overlay using the provided renderer.
   * @param renderer - The renderer to use for drawing.
   */
  abstract render(renderer: Renderer2D): void | Promise<void>;

  /**
   * Emits an overlay-loaded event.
   */
  protected emitLoaded(): void {
    if (this.eventBus) {
      this.eventBus.emit({
        type: LIGHTER_EVENTS.OVERLAY_LOADED,
        detail: { id: this.id },
      });
    }
  }

  /**
   * Emits an overlay-error event.
   * @param error - The error that occurred.
   */
  protected emitError(error: Error): void {
    if (this.eventBus) {
      this.eventBus.emit({
        type: LIGHTER_EVENTS.OVERLAY_ERROR,
        detail: { id: this.id, error },
      });
    }
  }

  /**
   * Generates a unique ID for overlays.
   * @param prefix - Optional prefix for the ID.
   * @returns A unique ID string.
   */
  protected generateId(prefix = "overlay"): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}
