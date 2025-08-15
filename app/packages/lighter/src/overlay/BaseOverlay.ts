/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { InteractionHandler } from "../interaction/InteractionManager";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { ResourceLoader } from "../resource/ResourceLoader";
import type { DrawStyle, Point, RawLookerLabel } from "../types";

/**
 * Base abstract class for all overlays.
 */
export abstract class BaseOverlay implements InteractionHandler {
  readonly id: string;
  readonly sampleId: string;
  readonly label: RawLookerLabel;
  readonly field?: string;
  /** Whether the overlay needs to be re-rendered. The render loop will check this and re-render the overlay if it is dirty.
   *
   * See also `markDirty` and `markClean`.
   */
  protected isDirty: boolean = false;

  protected renderer?: Renderer2D;
  protected eventBus?: EventBus;
  protected resourceLoader?: ResourceLoader;

  constructor(
    id: string,
    sampleId: string,
    label: RawLookerLabel = null,
    field?: string
  ) {
    this.id = id;
    this.sampleId = sampleId;
    this.label = label;
    this.field = field;
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
      // Handle undo
    });
    bus.on(LIGHTER_EVENTS.REDO, () => {
      // Handle redo
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
   * Renders the overlay using the provided renderer and style.
   * @param renderer - The renderer to use for drawing.
   * @param style - The drawing style to apply.
   */
  abstract render(
    renderer: Renderer2D,
    style: DrawStyle | null
  ): void | Promise<void>;

  /**
   * Marks the overlay as dirty, indicating it needs to be re-rendered.
   */
  markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Marks the overlay as clean, indicating it doesn't need to be re-rendered.
   */
  markClean(): void {
    this.isDirty = false;
  }

  /**
   * Checks if the overlay is dirty and needs to be re-rendered.
   * @returns True if the overlay is dirty.
   */
  getIsDirty(): boolean {
    return this.isDirty;
  }

  /**
   * Gets the container ID for this overlay.
   * @returns The container ID.
   */
  get containerId(): string {
    return this.id;
  }

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
    return `${prefix}_${Date.now()}_${Math.random()
      .toString(36)
      .substring(2, 9)}`;
  }

  /**
   * Cleanup method to be called when the overlay is destroyed.
   * Override this method in subclasses to perform specific cleanup.
   */
  destroy(): void {
    // Base implementation - subclasses should override if needed
  }

  // InteractionHandler interface implementation

  /**
   * Check if a point is within this overlay's bounds.
   * Default implementation uses renderer hit-testing.
   * @param point - The point to test.
   * @returns True if the point is within the overlay.
   */
  containsPoint(point: Point): boolean {
    if (!this.renderer) return false;
    return this.renderer.hitTest(point, this.containerId);
  }

  /**
   * Handle pointer down event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onPointerDown?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle pointer move event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onPointerMove?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle pointer up event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onPointerUp?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle click event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onClick?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle double-click event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onDoubleClick?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle hover enter event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onHoverEnter?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle hover leave event.
   * Override in subclasses to implement custom behavior.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onHoverLeave?(point: Point, event: PointerEvent): boolean;
}
