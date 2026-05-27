/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Undoable } from "@fiftyone/commands";
import type { InteractionHandler } from "../interaction/InteractionManager";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { PaintStrokeData } from "../overlay/MaskCanvas";
import type { Point, RawLookerLabel, Rect } from "../types";

/**
 * Event type definitions for lighter events.
 */
export type LighterEventGroup = {
  // ============================================================================
  // OVERLAY LIFECYCLE EVENTS
  // ============================================================================
  /** Emitted when an overlay is added to the scene */
  "lighter:overlay-added": { id: string; overlay: BaseOverlay };
  /** Emitted when an overlay has finished loading resources and is ready */
  "lighter:overlay-loaded": { id: string };
  /** Emitted when an overlay is removed from the scene */
  "lighter:overlay-removed": { id: string };
  /** Emitted when an overlay encounters an error during loading or rendering */
  "lighter:overlay-error": { id: string; error: Error };
  /** Emitted when an overlay's bounds change */
  "lighter:overlay-bounds-changed": {
    id: string;
    bounds: Rect;
  };
  /**
   * Emitted when an overlay's label is updated, or when an overlay's
   * editing state changes in a way subscribers need to observe (e.g.
   * `DetectionOverlay.initMask`/`removeMask` flipping mask-canvas state
   * without changing label data).
   */
  "lighter:overlay-label-updated": {
    id: string;
    label: RawLookerLabel;
    hasMask: boolean;
  };

  // ============================================================================
  // COMMAND & UNDO/REDO EVENTS
  // ============================================================================
  /** Emitted when a new command is executed and added to the undo stack */
  "lighter:command-executed": {
    commandId: string;
    isUndoable: boolean;
    command: Undoable;
  };
  /** Emitted when a command is undone (reversed) */
  "lighter:undo": { commandId: string };
  /** Emitted when a command is redone (re-executed) */
  "lighter:redo": { commandId: string };

  // ============================================================================
  // RESOURCE LOADING EVENTS
  // ============================================================================
  /** Emitted when a resource (image, texture, etc.) has finished loading. This doesn't apply to overlays that have no media. */
  "lighter:resource-loaded": { url: string; resource: any };
  /** Emitted when a resource fails to load. This doesn't apply to overlays that have no media. */
  "lighter:resource-error": { url: string; error: Error };

  // ============================================================================
  // USER INTERACTION EVENTS
  // ============================================================================
  /** Emitted on "pointer down" to inform detection mode to create a new detection */
  "lighter:overlay-create": { eventId: string };
  /** Emitted when an overlay finishes being established */
  "lighter:overlay-establish": {
    id: string;
    handler: InteractionHandler;
    startBounds: Rect;
    startPosition: Point;
    bounds: Rect;
  };
  /** Emitted when an overlay creation is undone, before the overlay is removed */
  "lighter:overlay-undone": { id: string };
  /** Emitted when an overlay starts being dragged */
  "lighter:overlay-drag-start": {
    id: string;
    startPosition: Point;
    bounds: Rect;
  };
  /** Emitted when an overlay is being dragged */
  "lighter:overlay-drag-move": {
    id: string;
    bounds: Rect;
  };
  /** Emitted when an overlay drag ends */
  "lighter:overlay-drag-end": {
    id: string;
    startPosition: Point;
    endPosition: Point;
    startBounds: Rect;
    bounds: Rect;
  };
  /** Emitted when an overlay starts being resized */
  "lighter:overlay-resize-start": {
    id: string;
    startPosition: Point;
    bounds: Rect;
  };
  /** Emitted when an overlay is being resized */
  "lighter:overlay-resize-move": {
    id: string;
    bounds: Rect;
  };
  /** Emitted when an overlay resize ends */
  "lighter:overlay-resize-end": {
    id: string;
    startPosition: Point;
    endPosition: Point;
    startBounds: Rect;
    bounds: Rect;
  };
  /** Emitted when an overlay is clicked */
  "lighter:overlay-click": { id: string; point: Point };
  /** Emitted when an overlay is double-clicked */
  "lighter:overlay-double-click": { id: string; point: Point };
  /** Emitted when an overlay is hovered */
  "lighter:overlay-hover": { id: string; point: Point };
  /** Emitted when an overlay is no longer hovered */
  "lighter:overlay-unhover": { id: string; point: Point };
  /** Emitted when all overlays are unhovered */
  "lighter:overlay-all-unhover": { point: Point };
  /** Emitted when the mouse moves while hovering over an overlay */
  "lighter:overlay-hover-move": { id: string; point: Point };
  /** Emitted when a paint stroke (brush/eraser) ends */
  "lighter:overlay-paint-end": {
    id: string;
    paintStrokeData: PaintStrokeData | undefined;
    /** True when this stroke is the first of a brand-new overlay */
    isEstablishing?: boolean;
  };
  /** Emitted when user clicks without dragging in detection mode to exit */
  "lighter:detection-mode-quit": { eventId: string };
  /** Emitted when user clicks without dragging in segmentation mode to close out the current detection */
  "lighter:segmentation-mode-quit": { eventId: string };
  /**
   * Generic "quit the active annotation mode" request, fired by global gestures
   * (e.g. right-click on empty canvas). Listeners are expected to no-op unless
   * their own mode is active, in which case they deactivate it.
   */
  "lighter:active-mode-quit-requested": { eventId: string };
  /** Emitted when the AI mask should be established and point selection ended (e.g. right-click). */
  "lighter:point-selection-finalize": { eventId: string };

  // ============================================================================
  // KEYPOINT EVENTS
  // ============================================================================
  /** Emitted when a keypoint is added during interactive creation */
  "lighter:keypoint-point-added": {
    id: string;
    pointId: string;
    /** Relative coordinates of the added point */
    point: Point;
    /** Optional keypoint variant. */
    variant?: string;
  };
  /** Emitted when a keypoint is moved via drag */
  "lighter:keypoint-point-moved": {
    id: string;
    pointId: string;
    /** Relative coordinates before the move */
    from: Point;
    /** Relative coordinates after the move */
    to: Point;
  };
  /** Emitted when a keypoint is deleted */
  "lighter:keypoint-point-deleted": {
    id: string;
    pointId: string;
    /** Optional keypoint variant. */
    variant?: string;
  };

  // ============================================================================
  // SELECTION EVENTS
  // ============================================================================
  /** Emitted when an overlay is selected */
  "lighter:overlay-select": {
    id: string;
    point: Point;
    ignoreSideEffects?: boolean;
    isShiftPressed?: boolean;
  };
  /** Emitted when an overlay is deselected */
  "lighter:overlay-deselect": {
    id: string;
    ignoreSideEffects?: boolean;
  };
  /** Emitted when the selection changes (multiple overlays selected/deselected) */
  "lighter:selection-changed": {
    selectedIds: string[];
    deselectedIds: string[];
  };
  /** Emitted when all overlays are deselected */
  "lighter:selection-cleared": {
    ignoreSideEffects?: boolean;
    previouslySelectedIds: string[];
  };

  // ============================================================================
  // SCENE-LEVEL EVENTS
  // ============================================================================
  /** Emitted when the canvas or container is resized */
  "lighter:resize": { width: number; height: number };
  /** Emitted when the canonical media's bounds change (resize, initial layout, etc.) */
  "lighter:canonical-media-bounds-changed": { bounds: Rect };
  /** Emitted when scene options change (activePaths, showOverlays, alpha) */
  "lighter:scene-options-changed": {
    activePaths?: string[];
    showOverlays?: boolean;
    alpha?: number;
  };
  /** Emitted when the scene interactive mode changes */
  "lighter:scene-interactive-mode-changed": { interactiveMode: boolean };
  /** Emitted when the viewport is zoomed (via wheel, pinch, or programmatic zoom) */
  "lighter:zoomed": { scale: number };
  /** Emitted when the viewport is panned/moved */
  "lighter:viewport-moved": { x: number; y: number; scale: number };
  /** Emitted by useViewport once the initial viewport has been applied (or no action was needed) */
  "lighter:viewport-init-complete": Record<string, never>;
  /** Emitted after PixiJS initialization completes and the render loop starts */
  "lighter:renderer-ready": Record<string, never>;

  // ============================================================================
  // "DO" EVENTS USERS CAN EMIT TO FORCE STATE CHANGES OR ACTIONS
  // ============================================================================
  /** Emitted when the overlay needs to be forced to hover state */
  "lighter:do-overlay-hover": {
    id: string;
    point?: Point;
    tooltip?: boolean;
  };
  /** Emitted when the overlay needs to be forced to unhover state */
  "lighter:do-overlay-unhover": { id: string };
};
