/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Command } from "../commands/Command";
import type { InteractiveDetectionHandler } from "../interaction/InteractiveDetectionHandler";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Point, Rect } from "../types";

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
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };

  // ============================================================================
  // COMMAND & UNDO/REDO EVENTS
  // ============================================================================
  /** Emitted when a new command is executed and added to the undo stack */
  "lighter:command-executed": {
    commandId: string;
    isUndoable: boolean;
    command: Command;
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
  /** Emitted when an overlay finishes being established */
  "lighter:overlay-establish": {
    id: string;
    overlay: InteractiveDetectionHandler;
    startBounds: Rect;
    startPosition: Point;
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };
  /** Emitted when an overlay creation is undone, before the overlay is removed */
  "lighter:overlay-undone": { id: string };
  /** Emitted when an overlay starts being dragged */
  "lighter:overlay-drag-start": {
    id: string;
    startPosition: Point;
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };
  /** Emitted when an overlay is being dragged */
  "lighter:overlay-drag-move": {
    id: string;
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };
  /** Emitted when an overlay drag ends */
  "lighter:overlay-drag-end": {
    id: string;
    startPosition: Point;
    endPosition: Point;
    startBounds: Rect;
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };
  /** Emitted when an overlay starts being resized */
  "lighter:overlay-resize-start": {
    id: string;
    startPosition: Point;
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };
  /** Emitted when an overlay is being resized */
  "lighter:overlay-resize-move": {
    id: string;
    absoluteBounds: Rect;
    relativeBounds: Rect;
  };
  /** Emitted when an overlay resize ends */
  "lighter:overlay-resize-end": {
    id: string;
    startPosition: Point;
    endPosition: Point;
    startBounds: Rect;
    absoluteBounds: Rect;
    relativeBounds: Rect;
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
  /** Emitted when the canonical media overlay is changed */
  "lighter:canonical-media-changed": { overlayId: string };
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
