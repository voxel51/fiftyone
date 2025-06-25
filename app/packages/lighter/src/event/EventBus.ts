/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

/**
 * Event type constants for overlay events.
 */
export const LIGHTER_EVENTS = {
  /** Emitted when an overlay is added to the scene */
  OVERLAY_ADDED: "overlay-added",
  /** Emitted when an overlay has finished loading resources and is ready */
  OVERLAY_LOADED: "overlay-loaded",
  /** Emitted when an overlay is removed from the scene */
  OVERLAY_REMOVED: "overlay-removed",
  /** Emitted when an overlay encounters an error during loading or rendering */
  OVERLAY_ERROR: "overlay-error",
  /** Emitted when an annotation is added to the scene. An annotation is an overlay after it's committed to the scene. */
  ANNOTATION_ADDED: "annotation-added",
  /** Emitted when an annotation is removed from the scene. An annotation is an overlay after it's committed to the scene. */
  ANNOTATION_REMOVED: "annotation-removed",
  /** Emitted when an undo operation is performed */
  UNDO: "undo",
  /** Emitted when a redo operation is performed */
  REDO: "redo",
  /** Emitted when a resource (image, texture, etc.) has finished loading. This doesn't apply to overlays that have no media. */
  RESOURCE_LOADED: "resource-loaded",
  /** Emitted when a resource fails to load. This doesn't apply to overlays that have no media. */
  RESOURCE_ERROR: "resource-error",
  /** Emitted when the canvas or container is resized */
  RESIZE: "resize",
} as const;

/**
 * Overlay events that can be emitted.
 */
export type OverlayEvent =
  | { type: typeof LIGHTER_EVENTS.OVERLAY_ADDED; detail: { id: string } }
  | { type: typeof LIGHTER_EVENTS.OVERLAY_LOADED; detail: { id: string } }
  | { type: typeof LIGHTER_EVENTS.OVERLAY_REMOVED; detail: { id: string } }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_ERROR;
      detail: { id: string; error: Error };
    }
  | {
      type: typeof LIGHTER_EVENTS.ANNOTATION_ADDED;
      detail: { id: string; annotation: any };
    }
  | { type: typeof LIGHTER_EVENTS.ANNOTATION_REMOVED; detail: { id: string } }
  | { type: typeof LIGHTER_EVENTS.UNDO; detail: { commandId: string } }
  | { type: typeof LIGHTER_EVENTS.REDO; detail: { commandId: string } }
  | {
      type: typeof LIGHTER_EVENTS.RESOURCE_LOADED;
      detail: { url: string; resource: any };
    }
  | {
      type: typeof LIGHTER_EVENTS.RESOURCE_ERROR;
      detail: { url: string; error: Error };
    }
  | {
      type: typeof LIGHTER_EVENTS.RESIZE;
      detail: { width: number; height: number };
    };

/**
 * Event bus for communication between components.
 */
export class EventBus extends EventTarget {
  /**
   * Emits an event.
   * @param event - The event to emit.
   */
  emit(event: OverlayEvent): void {
    const customEvent = new CustomEvent(event.type, { detail: event.detail });
    this.dispatchEvent(customEvent);
  }

  /**
   * Registers an event listener.
   * @param type - The event type to listen for.
   * @param listener - The event listener function.
   */
  on(type: OverlayEvent["type"], listener: (e: CustomEvent) => void): void {
    this.addEventListener(type, listener as EventListener);
  }

  /**
   * Removes an event listener.
   * @param type - The event type.
   * @param listener - The event listener function.
   */
  off(type: OverlayEvent["type"], listener: (e: CustomEvent) => void): void {
    this.removeEventListener(type, listener as EventListener);
  }
}
