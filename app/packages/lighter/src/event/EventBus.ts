/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import { AnnotationLabel } from "@fiftyone/state";
import { Command } from "../commands/Command";
import { InteractiveDetectionHandler } from "../interaction/InteractiveDetectionHandler";
import { BaseOverlay } from "../overlay/BaseOverlay";
import type { Point, Rect } from "../types";
import { Field } from "@fiftyone/utilities";

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
  /** Emitted when an overlay finishes being established */
  OVERLAY_ESTABLISH: "overlay-establish",
  /** Emitted when an overlay starts being dragged */
  OVERLAY_DRAG_START: "overlay-drag-start",
  /** Emitted when an overlay is being dragged */
  OVERLAY_DRAG_MOVE: "overlay-drag-move",
  /** Emitted when an overlay drag ends */
  OVERLAY_DRAG_END: "overlay-drag-end",
  /** Emitted when an overlay starts being resized */
  OVERLAY_RESIZE_START: "overlay-resize-start",
  /** Emitted when an overlay is being resized */
  OVERLAY_RESIZE_MOVE: "overlay-resize-move",
  /** Emitted when an overlay resize ends */
  OVERLAY_RESIZE_END: "overlay-resize-end",
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
  /** Emitted when the viewport is zoomed (via wheel, pinch, or programmatic zoom) */
  ZOOMED: "zoomed",

  // ============================================================================
  // "DO" EVENTS USERS CAN EMIT TO FORCE STATE CHANGES OR ACTIONS
  // ============================================================================
  /** Emitted when the overlay needs to be forced to hover state */
  DO_OVERLAY_HOVER: "do-overlay-hover",
  /** Emitted when the overlay needs to be forced to unhover state */
  DO_OVERLAY_UNHOVER: "do-overlay-unhover",
  /** Emitted when the overlay needs to be persisted */
  DO_PERSIST_OVERLAY: "do-persist-overlay",
  /** Emitted when the overlay needs to be removed */
  DO_REMOVE_OVERLAY: "do-remove-overlay",
} as const;

/**
 * Overlay lifecycle events.
 */
export type OverlayEvent =
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_ADDED;
      detail: { id: string; overlay: BaseOverlay };
    }
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
 * Command and undo/redo events.
 */
export type CommandEvent =
  | {
      type: typeof LIGHTER_EVENTS.COMMAND_EXECUTED;
      detail: { commandId: string; isUndoable: boolean; command: Command };
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
      type: typeof LIGHTER_EVENTS.OVERLAY_ESTABLISH;
      detail: {
        id: string;
        overlay: InteractiveDetectionHandler;
        startBounds: Rect;
        startPosition: Point;
        absoluteBounds: Rect;
        relativeBounds: Rect;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DRAG_START;
      detail: {
        id: string;
        startPosition: Point;
        absoluteBounds: Rect;
        relativeBounds: Rect;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DRAG_MOVE;
      detail: { id: string; absoluteBounds: Rect; relativeBounds: Rect };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_DRAG_END;
      detail: {
        id: string;
        startPosition: Point;
        endPosition: Point;
        startBounds: Rect;
        absoluteBounds: Rect;
        relativeBounds: Rect;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_RESIZE_START;
      detail: {
        id: string;
        startPosition: Point;
        absoluteBounds: Rect;
        relativeBounds: Rect;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_RESIZE_MOVE;
      detail: { id: string; absoluteBounds: Rect; relativeBounds: Rect };
    }
  | {
      type: typeof LIGHTER_EVENTS.OVERLAY_RESIZE_END;
      detail: {
        id: string;
        startPosition: Point;
        endPosition: Point;
        startBounds: Rect;
        absoluteBounds: Rect;
        relativeBounds: Rect;
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
    }
  | {
      type: typeof LIGHTER_EVENTS.ZOOMED;
      detail: { scale: number };
    };

/**
 * "Do" events.
 */
export type DoLighterEvent =
  | {
      type: typeof LIGHTER_EVENTS.DO_OVERLAY_HOVER;
      detail: { id: string; point?: Point; tooltip?: boolean };
    }
  | {
      type: typeof LIGHTER_EVENTS.DO_OVERLAY_UNHOVER;
      detail: { id: string };
    }
  | {
      type: typeof LIGHTER_EVENTS.DO_PERSIST_OVERLAY;
      detail: {
        label: AnnotationLabel;
        schema: Field;
        onSuccess?: () => void;
        onError?: (error?: Error | string) => void;
      };
    }
  | {
      type: typeof LIGHTER_EVENTS.DO_REMOVE_OVERLAY;
      detail: {
        label: AnnotationLabel;
        schema: Field;
        onSuccess?: () => void;
        onError?: (error?: Error | string) => void;
      };
    };

/**
 * All lighter events that can be emitted.
 */
export type LighterEvent =
  | OverlayEvent
  | CommandEvent
  | ResourceEvent
  | InteractionEvent
  | SelectionEvent
  | SceneEvent
  | DoLighterEvent;

/**
 * Type for Lighter event payloads.
 */
export type LighterEventDetail<T extends LighterEvent["type"]> = Extract<
  LighterEvent,
  { type: T }
>["detail"];

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
  on<T extends LighterEvent["type"]>(
    type: T,
    listener: (e: CustomEvent<LighterEventDetail<T>>) => void,
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
  off<T extends LighterEvent["type"]>(
    type: T,
    listener: (e: CustomEvent<LighterEventDetail<T>>) => void
  ): void {
    this.removeEventListener(type, listener as EventListener);
  }
}
