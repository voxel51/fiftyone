/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Point, Rect } from "../types";

/**
 * Event type constants for lighter events.
 * Organized into logical sections for better maintainability.
 */
export const LIGHTER_EVENTS = {
  // ============================================================================
  // OVERLAY LIFECYCLE EVENTS
  // ============================================================================
  /** Emitted when an overlay is added to the scene */
  OVERLAY_ADDED: "overlay-added",
  /** Emitted when an overlay has finished loading resources and is ready */
  OVERLAY_LOADED: "overlay-loaded",
  /** Emitted when an overlay is removed from the scene */
  OVERLAY_REMOVED: "overlay-removed",
  /** Emitted when an overlay encounters an error during loading or rendering */
  OVERLAY_ERROR: "overlay-error",
  /** Emitted when an overlay's bounds change */
  OVERLAY_BOUNDS_CHANGED: "overlay-bounds-changed",

  // ============================================================================
  // ANNOTATION EVENTS
  // ============================================================================
  /** Emitted when an annotation is added to the scene. An annotation is an overlay after it's committed to the scene. */
  ANNOTATION_ADDED: "annotation-added",
  /** Emitted when an annotation is removed from the scene. An annotation is an overlay after it's committed to the scene. */
  ANNOTATION_REMOVED: "annotation-removed",

  // ============================================================================
  // COMMAND & UNDO/REDO EVENTS
  // ============================================================================
  /** Emitted when a new command is executed and added to the undo stack */
  COMMAND_EXECUTED: "command-executed",
  /** Emitted when a command is undone (reversed) */
  UNDO: "undo",
  /** Emitted when a command is redone (re-executed) */
  REDO: "redo",

  // ============================================================================
  // RESOURCE LOADING EVENTS
  // ============================================================================
  /** Emitted when a resource (image, texture, etc.) has finished loading. This doesn't apply to overlays that have no media. */
  RESOURCE_LOADED: "resource-loaded",
  /** Emitted when a resource fails to load. This doesn't apply to overlays that have no media. */
  RESOURCE_ERROR: "resource-error",

  // ============================================================================
  // USER INTERACTION EVENTS
  // ============================================================================
  /** Emitted when an overlay starts being dragged */
  OVERLAY_DRAG_START: "overlay-drag-start",
  /** Emitted when an overlay is being dragged */
  OVERLAY_DRAG_MOVE: "overlay-drag-move",
  /** Emitted when an overlay drag ends */
  OVERLAY_DRAG_END: "overlay-drag-end",
  /** Emitted when an overlay is clicked */
  OVERLAY_CLICK: "overlay-click",
  /** Emitted when an overlay is double-clicked */
  OVERLAY_DOUBLE_CLICK: "overlay-double-click",
  /** Emitted when an overlay is hovered */
  OVERLAY_HOVER: "overlay-hover",
  /** Emitted when an overlay is no longer hovered */
  OVERLAY_UNHOVER: "overlay-unhover",
  /** Emitted when all overlays are unhovered */
  OVERLAY_ALL_UNHOVER: "overlay-all-unhover",
  /** Emitted when the mouse moves while hovering over an overlay */
  OVERLAY_HOVER_MOVE: "overlay-hover-move",

  // ============================================================================
  // SELECTION EVENTS
  // ============================================================================
  /** Emitted when an overlay is selected */
  OVERLAY_SELECT: "overlay-select",
  /** Emitted when an overlay is deselected */
  OVERLAY_DESELECT: "overlay-deselect",
  /** Emitted when the selection changes (multiple overlays selected/deselected) */
  SELECTION_CHANGED: "selection-changed",
  /** Emitted when all overlays are deselected */
  SELECTION_CLEARED: "selection-cleared",

  // ============================================================================
  // SPATIAL MANIPULATION EVENTS
  // ============================================================================
  /** Emitted to request spatial shifting of overlays */
  SPATIAL_SHIFT: "spatial-shift",
  /** Emitted to request dimension changes of overlays */
  SPATIAL_RESIZE: "spatial-resize",
  /** Emitted to request position changes of overlays */
  SPATIAL_MOVE: "spatial-move",

  // ============================================================================
  // SCENE-LEVEL EVENTS
  // ============================================================================
  /** Emitted when the canvas or container is resized */
  RESIZE: "resize",
  /** Emitted when the canonical media overlay is changed */
  CANONICAL_MEDIA_CHANGED: "canonical-media-changed",
  /** Emitted when scene options change (activePaths, showOverlays, alpha) */
  SCENE_OPTIONS_CHANGED: "scene-options-changed",
  /** Emitted when the scene interactive mode changes */
  SCENE_INTERACTIVE_MODE_CHANGED: "scene-interactive-mode-changed",
} as const;

/**
 * Overlay lifecycle events.
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
      type: typeof LIGHTER_EVENTS.OVERLAY_BOUNDS_CHANGED;
      detail: { id: string; absoluteBounds: Rect; relativeBounds: Rect };
    };

/**
 * Annotation events.
 */
export type AnnotationEvent =
  | {
      type: typeof LIGHTER_EVENTS.ANNOTATION_ADDED;
      detail: { id: string; annotation: any };
    }
  | { type: typeof LIGHTER_EVENTS.ANNOTATION_REMOVED; detail: { id: string } };

/**
 * Command and undo/redo events.
 */
export type CommandEvent =
  | {
      type: typeof LIGHTER_EVENTS.COMMAND_EXECUTED;
      detail: { commandId: string; isUndoable: boolean };
    }
  | { type: typeof LIGHTER_EVENTS.UNDO; detail: { commandId: string } }
  | { type: typeof LIGHTER_EVENTS.REDO; detail: { commandId: string } };

/**
 * Resource loading events.
 */
export type ResourceEvent =
  | {
      type: typeof LIGHTER_EVENTS.RESOURCE_LOADED;
      detail: { url: string; resource: any };
    }
  | {
      type: typeof LIGHTER_EVENTS.RESOURCE_ERROR;
      detail: { url: string; error: Error };
    };

/**
 * User interaction events with overlays.
 */
export type InteractionEvent =
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DRAG_START;
      detail: { id: string; startPoint: Point; startPosition: Point };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DRAG_MOVE;
      detail: {
        id: string;
        currentPoint: Point;
        delta: Point;
        startPosition: Point;
        currentPosition: Point;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DRAG_END;
      detail: {
        id: string;
        endPoint: Point;
        totalDelta: Point;
        startPosition: Point;
        endPosition: Point;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_CLICK;
      detail: { id: string; point: Point };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DOUBLE_CLICK;
      detail: { id: string; point: Point };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_HOVER;
      detail: { id: string; point: Point };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_UNHOVER;
      detail: { id: string; point: Point };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_ALL_UNHOVER;
      detail: { point: Point };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_HOVER_MOVE;
      detail: { id: string; point: Point };
    };

/**
 * Selection events.
 */
export type SelectionEvent =
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_SELECT;
      detail: {
        id: string;
        point: Point;
        isShiftPressed?: boolean;
        isBridgeLogicHandled?: boolean;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DESELECT;
      detail: { id: string; isBridgeLogicHandled?: boolean };
    }
  | {
      type: typeof LIGHTER_EVENTS.SELECTION_CHANGED;
      detail: { selectedIds: string[]; deselectedIds: string[] };
    }
  | {
      type: typeof LIGHTER_EVENTS.SELECTION_CLEARED;
      detail: {
        previouslySelectedIds: string[];
        isBridgeLogicHandled?: boolean;
      };
    };

/**
 * Spatial manipulation events.
 */
export type SpatialEvent =
  | {
      type: typeof LIGHTER_EVENTS.SPATIAL_SHIFT;
      detail: {
        targetIds?: string[]; // If not provided, applies to selected overlays
        deltaX: number;
        deltaY: number;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.SPATIAL_RESIZE;
      detail: {
        targetIds?: string[]; // If not provided, applies to selected overlays
        deltaWidth: number;
        deltaHeight: number;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.SPATIAL_MOVE;
      detail: {
        targetIds?: string[]; // If not provided, applies to selected overlays
        newX: number;
        newY: number;
      };
    };

/**
 * Scene-level events.
 */
export type SceneEvent =
  | {
      type: typeof LIGHTER_EVENTS.RESIZE;
      detail: { width: number; height: number };
    }
  | {
      type: typeof LIGHTER_EVENTS.CANONICAL_MEDIA_CHANGED;
      detail: { overlayId: string };
    }
  | {
      type: typeof LIGHTER_EVENTS.SCENE_OPTIONS_CHANGED;
      detail: {
        activePaths?: string[];
        showOverlays?: boolean;
        alpha?: number;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.SCENE_INTERACTIVE_MODE_CHANGED;
      detail: { interactiveMode: boolean };
    };

/**
 * All lighter events that can be emitted.
 */
export type LighterEvent =
  | OverlayEvent
  | AnnotationEvent
  | CommandEvent
  | ResourceEvent
  | InteractionEvent
  | SelectionEvent
  | SpatialEvent
  | SceneEvent;

/**
 * Events that can be emitted safely.
 *
 * TODO: This should be a subset of LighterEvent, since
 * not all events are safe to emit from "outside" of lighter.
 */
export type SafeLighterEvent =
  | OverlayEvent
  | AnnotationEvent
  | CommandEvent
  | ResourceEvent
  | InteractionEvent
  | SelectionEvent
  | SpatialEvent
  | SceneEvent;

/**
 * Event bus for communication between components.
 */
export class EventBus extends EventTarget {
  /**
   * Emits an event.
   * @param event - The event to emit.
   */
  emit(event: LighterEvent): void {
    const customEvent = new CustomEvent(event.type, { detail: event.detail });
    this.dispatchEvent(customEvent);
  }

  /**
   * Registers an event listener.
   * @param type - The event type to listen for.
   * @param listener - The event listener function.
   * @param abortController - The abort controller to use for the event listener.
   * Calling `abort` on this will remove the event listener.
   */
  on(
    type: LighterEvent["type"],
    listener: (e: CustomEvent) => void,
    abortController?: AbortController
  ): void {
    if (abortController) {
      this.addEventListener(type, listener as EventListener, {
        signal: abortController.signal,
      });
    } else {
      this.addEventListener(type, listener as EventListener);
    }
  }

  /**
   * Removes an event listener.
   * @param type - The event type.
   * @param listener - The event listener function.
   */
  off(type: LighterEvent["type"], listener: (e: CustomEvent) => void): void {
    this.removeEventListener(type, listener as EventListener);
  }
}
