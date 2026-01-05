/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { EventDispatcher, getEventBus } from "@fiftyone/events";
import { UndoRedoManager } from "../commands/UndoRedoManager";
import { TypeGuards } from "../core/Scene2D";
import type { LighterEventGroup } from "../events";
import {
  BoundingBoxOverlay,
  type MoveState,
} from "../overlay/BoundingBoxOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { SelectionManager } from "../selection/SelectionManager";
import type { Point, Rect } from "../types";
import { InteractiveDetectionHandler } from "./InteractiveDetectionHandler";

/**
 * Interface for objects that can handle interaction events.
 */
export interface InteractionHandler {
  readonly id: string;
  readonly cursor?: string;
  overlay?: BoundingBoxOverlay;

  /**
   * Returns true if the handler is being dragged or resized.
   */
  isMoving?(): boolean;

  /**
   * Returns true if the handler is being dragged.
   */
  isDragging?(): boolean;

  /**
   * Returns true if the handler is being resized.
   */
  isResizing?(): boolean;

  /**
   * Returns true if a new BoundingBoxOverlay is being created.
   */
  isSetting?(): boolean;

  /**
   * Returns the type of cursor that is currently appropriate
   * @param worldPoint - Current screen location translated to viewport location.
   * @param scale - The current scaling factor of the renderer.
   */
  getCursor?(worldPoint: Point, scale: number): string;

  /**
   * Returns the current move state of the handler
   */
  getMoveState?(): MoveState;

  /**
   * Returns the position from the start of handler movement
   */
  getMoveStartPosition?(): Point | undefined;

  /**
   * Returns the bounds of the handler
   */
  getAbsoluteBounds?(): Rect;

  /**
   * Returns the position from the start of handler movement
   */
  getMoveStartBounds?(): Rect | undefined;

  /**
   * Handle pointer down event.
   * @param point - The point where the event occurred.
   * @param worldPoint - Screen point translated to viewport point.
   * @param event - The original pointer event.
   * @param scale - The current scaling factor of the renderer.
   * @returns True if the event was handled and should not propagate.
   */
  onPointerDown?(
    point: Point,
    worldPoint: Point,
    event: PointerEvent,
    scale: number
  ): boolean;

  /**
   * Handle pointer move event.
   * @param point - The point where the event occurred.
   * @param worldPoint - Screen point translated to viewport point.
   * @param event - The original pointer event.
   * @param scale - The current scaling factor of the renderer.
   * @param maintainAspectRatio - Maintain aspect ratio during resize (shift key held).
   * @returns True if the event was handled.
   */
  onMove?(
    point: Point,
    worldPoint: Point,
    event: PointerEvent,
    scale: number,
    maintainAspectRatio?: boolean
  ): boolean;

  /**
   * Handle pointer up event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @param scale - The current scaling factor of the renderer.
   * @returns True if the event was handled.
   */
  onPointerUp?(point: Point, event: PointerEvent, scale: number): boolean;

  /**
   * Handle click event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @param scale - The current scaling factor of the renderer.
   * @returns True if the event was handled.
   */
  onClick?(point: Point, event: PointerEvent, scale: number): boolean;

  /**
   * Handle double-click event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onDoubleClick?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle hover enter event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onHoverEnter?(point: Point | null, event: PointerEvent | null): boolean;

  /**
   * Handle hover leave event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onHoverLeave?(point: Point | null, event: PointerEvent | null): boolean;

  /**
   * Handle hover move event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onHoverMove?(point: Point, event: PointerEvent): boolean;

  /**
   * Forces the overlay to be in hovered state.
   */
  forceHoverEnter?(): void;

  /**
   * Forces the overlay to be in unhovered state.
   */
  forceHoverLeave?(): void;

  /**
   * Check if this handler can handle events at the given point.
   * @param point - The point to test.
   * @returns True if this handler can handle events at the point.
   */
  containsPoint(point: Point): boolean;

  /**
   * Marks the overlay as dirty, indicating it needs to be re-rendered.
   */
  markDirty(): void;

  /**
   * Release any resources held by the handler.
   */
  cleanup?(): void;
}

/**
 * Manages all interaction events and coordinates with overlays.
 * Now knows about overlays and manages drag state internally.
 */
export class InteractionManager {
  private handlers: InteractionHandler[] = [];
  private hoveredHandler?: InteractionHandler;
  private clickStartTime = 0;
  private clickStartPoint?: Point;
  private lastClickTime = 0;
  private lastClickPoint?: Point;
  private maintainAspectRatio = false;

  private canonicalMediaId?: string;

  // Configuration
  private readonly CLICK_THRESHOLD = 0.1;
  private readonly CLICK_TIME_THRESHOLD = 300; // ms
  private readonly DOUBLE_CLICK_TIME_THRESHOLD = 500; // ms
  private readonly DOUBLE_CLICK_DISTANCE_THRESHOLD = 10; // pixels

  private currentPixelCoordinates?: Point;
  private readonly eventBus: EventDispatcher<LighterEventGroup>;

  constructor(
    private canvas: HTMLCanvasElement,
    private undoRedoManager: UndoRedoManager,
    private selectionManager: SelectionManager,
    private renderer: Renderer2D,
    sceneId: string
  ) {
    this.eventBus = getEventBus<LighterEventGroup>(sceneId);
    this.setupEventListeners();
  }

  /**
   * Set the canonical media id.
   * @param id - The id of the canonical media.
   */
  public setCanonicalMediaId(id: string): void {
    this.canonicalMediaId = id;
  }

  /**
   * Get the current pixel coordinates.
   * This is the raw pixel coordinates where mouse cursor is,
   * but the reference system is the canvas.
   *
   * @returns The current pixel coordinates or undefined.
   */
  public getPixelCoordinates(): Point | undefined {
    return this.currentPixelCoordinates;
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown);
    this.canvas.addEventListener("pointermove", this.handlePointerMove);
    this.canvas.addEventListener("pointerup", this.handlePointerUp);
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.addEventListener("wheel", this.handleWheel, { passive: false });
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    this.eventBus.on("lighter:zoomed", this.handleZoomed);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();

    this.clickStartTime = Date.now();
    this.clickStartPoint = point;

    let handler: InteractionHandler | undefined = undefined;

    const interactiveHandler = this.getInteractiveHandler();

    if (interactiveHandler) {
      handler = interactiveHandler.getOverlay();
      this.selectionManager.select(handler.id);
    } else {
      handler = this.findHandlerAtPoint(point);
    }

    if (handler?.onPointerDown?.(point, worldPoint, event, scale)) {
      const cursor = handler.getCursor?.(worldPoint, scale);
      if (cursor) {
        this.canvas.style.cursor = cursor;
      }

      // If this is a movable overlay, track move state
      if (TypeGuards.isMovable(handler) && TypeGuards.isSpatial(handler)) {
        const type: keyof LighterEventGroup = handler.isDragging?.()
          ? "lighter:overlay-drag-start"
          : "lighter:overlay-resize-start";

        this.eventBus.dispatch(type, {
          id: handler.id,
          startPosition: handler.getPosition(),
          absoluteBounds: handler.getAbsoluteBounds(),
          relativeBounds: handler.getRelativeBounds(),
        });
      }

      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();
    this.currentPixelCoordinates = point;

    const interactiveHandler = this.getInteractiveHandler();
    let handler = this.findMovingHandler() || this.findHandlerAtPoint(point);

    if (!interactiveHandler) {
      // we don't want to handle hover in interactive mode
      // for instance, no tooltips, no hover states, etc
      this.handleHover(this.currentPixelCoordinates, event);
    }

    if (handler) {
      // Handle drag move
      if (!interactiveHandler) {
        handler.onMove?.(
          point,
          worldPoint,
          event,
          scale,
          this.maintainAspectRatio
        );
      } else {
        handler = interactiveHandler.getOverlay();

        handler.onMove?.(
          point,
          worldPoint,
          event,
          scale,
          this.maintainAspectRatio
        );
      }

      if (handler.isMoving?.()) {
        this.renderer.disableZoomPan();

        // Emit move event with bounds information
        if (TypeGuards.isSpatial(handler)) {
          const type = handler.isDragging?.()
            ? "lighter:overlay-drag-move"
            : "lighter:overlay-resize-move";

          this.eventBus.dispatch(type, {
            id: handler.id,
            absoluteBounds: handler.getAbsoluteBounds(),
            relativeBounds: handler.getRelativeBounds(),
          });
        }

        event.preventDefault();
      }

      // Update cursor
      if (TypeGuards.isInteractionHandler(handler) && handler.getCursor) {
        this.canvas.style.cursor = handler.getCursor(worldPoint, scale);
      }
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();
    const now = Date.now();

    let handler: InteractionHandler | undefined = undefined;

    const interactiveHandler = this.getInteractiveHandler();

    if (interactiveHandler) {
      handler = interactiveHandler.getOverlay();
    } else {
      handler = this.findMovingHandler() || this.findHandlerAtPoint(point);
    }

    if (handler?.isMoving?.()) {
      const moveState = handler.getMoveState?.();
      const startBounds = handler.getMoveStartBounds?.();
      const startPosition = handler.getMoveStartPosition?.();

      // Handle drag end
      handler.onPointerUp?.(point, event, scale);

      if (interactiveHandler) {
        // When interactive detection is complete, remove the interactive handler
        // The overlay will be managed by its own handler
        this.removeHandler(interactiveHandler);
      }

      this.canvas.style.cursor =
        handler.getCursor?.(worldPoint, scale) || this.canvas.style.cursor;

      // Emit move end event with bounds information
      if (TypeGuards.isSpatial(handler) && startBounds && startPosition) {
        const detail = {
          id: handler.id,
          startBounds,
          startPosition,
          endPosition: handler.getPosition(),
          absoluteBounds: handler.getAbsoluteBounds(),
          relativeBounds: handler.getRelativeBounds(),
        };

        if (moveState === "SETTING") {
          if (!interactiveHandler) {
            throw new Error(
              "Invariant violation: moveState is SETTING but interactiveHandler is undefined"
            );
          }

          this.eventBus.dispatch("lighter:overlay-establish", {
            ...detail,
            overlay: interactiveHandler,
          });
        } else {
          const type =
            moveState === "DRAGGING"
              ? "lighter:overlay-drag-end"
              : "lighter:overlay-resize-end";
          this.eventBus.dispatch(type, detail);
        }
      }

      this.canvas.releasePointerCapture(event.pointerId);
      // Re-enable zoom/pan after overlay dragging ends
      this.renderer.enableZoomPan();
      event.preventDefault();
    } else if (handler && !handler.isMoving?.()) {
      // This was a click, not a drag - handle as click for selection
      this.handleClick(point, event, now);

      // Clean up drag handler
      handler.onPointerUp?.(point, event, scale);
      this.canvas.releasePointerCapture(event.pointerId);
    } else {
      // Handle click
      this.handleClick(point, event, now);
    }

    this.canvas.style.cursor =
      handler?.getCursor?.(worldPoint, scale) || this.canvas.style.cursor;
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    const movingHandler = this.findMovingHandler();

    if (movingHandler) {
      this.canvas.releasePointerCapture(event.pointerId);
      // Re-enable zoom/pan after drag cancellation
      this.renderer.enableZoomPan();
    }
  };

  private handlePointerLeave = (event: PointerEvent): void => {
    // Clear hover state when leaving canvas
    if (this.hoveredHandler) {
      const point = this.getCanvasPoint(event);
      this.hoveredHandler.onHoverLeave?.(point, event);
      this.hoveredHandler = undefined;
    }
  };

  private handleWheel = (event: WheelEvent): void => {
    // If we are zooming in with mouse and target is canvas, prevent default
    // because we want zoom to be handled by canvas only
    if (event.target === this.canvas) {
      event.preventDefault();
    }
  };

  /**
   * Handles keyboard events for undo/redo shortcuts and shift modifier to maintain aspect ratio.
   * @param event - The keyboard event.
   */
  private handleKeyDown = (event: KeyboardEvent): void => {
    // Check if we're in an input field - don't handle shortcuts there
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        (activeElement as HTMLElement).contentEditable === "true")
    ) {
      return;
    }

    // Handle undo: Ctrl+Z (or Cmd+Z on Mac)
    if (
      (event.ctrlKey || event.metaKey) &&
      event.key === "z" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.undoRedoManager.undo();
      return;
    }

    // Handle redo: Ctrl+Y or Ctrl+Shift+Z (or Cmd+Y/Cmd+Shift+Z on Mac)
    if (
      (event.ctrlKey || event.metaKey) &&
      ((event.key === "y" && !event.shiftKey) ||
        (event.key === "z" && event.shiftKey))
    ) {
      event.preventDefault();
      event.stopPropagation();
      this.undoRedoManager.redo();
      return;
    }

    if (event.shiftKey) {
      this.maintainAspectRatio = event.shiftKey;
      return;
    }
  };

  /**
   * Handles keyboard events for release of shift modifier to maintain aspect ratio.
   * @param event - The keyboard event.
   */
  private handleKeyUp = (event: KeyboardEvent): void => {
    // Check if we're in an input field - don't handle shortcuts there
    const activeElement = document.activeElement;
    if (
      activeElement &&
      (activeElement.tagName === "INPUT" ||
        activeElement.tagName === "TEXTAREA" ||
        (activeElement as HTMLElement).contentEditable === "true")
    ) {
      return;
    }

    this.maintainAspectRatio = event.shiftKey;
  };

  private handleClick(point: Point, event: PointerEvent, now: number): void {
    if (!this.clickStartPoint || !this.clickStartTime) return;

    const distance = Math.sqrt(
      Math.pow(point.x - this.clickStartPoint.x, 2) +
        Math.pow(point.y - this.clickStartPoint.y, 2)
    );
    const duration = now - this.clickStartTime;

    // Check if this is a valid click (not too much movement or time)
    if (
      distance <= this.CLICK_THRESHOLD &&
      duration <= this.CLICK_TIME_THRESHOLD
    ) {
      // Skip canonical media (background) when finding handler for clicks
      // This ensures clicking on empty space clears selection
      const handler = this.findHandlerAtPoint(point, true);

      // Check for double-click first
      if (this.isDoubleClick(point, now)) {
        if (handler?.onDoubleClick?.(point, event)) {
          event.preventDefault();
          return;
        }
      }

      // Handle selection if the handler is selectable
      if (handler && TypeGuards.isSelectable(handler)) {
        this.selectionManager.toggle(handler.id, { event });
        event.preventDefault();
      }
      // Otherwise, handle regular click
      else if (handler?.onClick?.(point, event, this.renderer.getScale())) {
        event.preventDefault();
      }
      // If no handler was found, clear selection
      else if (!handler) {
        this.selectionManager.clearSelection();
      }

      this.lastClickTime = now;
      this.lastClickPoint = point;
    }
  }

  private handleHover(point: Point, event: PointerEvent): void {
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();

    const handler = this.findHandlerAtPoint(point);
    const movingHandler = this.findMovingHandler();

    if (!handler || handler.id === this.canonicalMediaId) {
      this.canvas.style.cursor = "default";

      if (this.hoveredHandler) {
        this.hoveredHandler.onHoverLeave?.(point, event);

        this.eventBus.dispatch("lighter:overlay-unhover", {
          id: this.hoveredHandler.id,
          point,
        });

        this.eventBus.dispatch("lighter:overlay-all-unhover", { point });
      }

      this.hoveredHandler = undefined;

      return;
    }

    // If we are dragging, we should unhover the previous one
    if (movingHandler) {
      if (this.hoveredHandler) {
        this.hoveredHandler.onHoverLeave?.(point, event);
        this.eventBus.dispatch("lighter:overlay-unhover", {
          id: this.hoveredHandler.id,
          point,
        });
        this.hoveredHandler = undefined;
      }
      return;
    }

    // If we are hovering on a different overlay, unhover the previous one
    if (this.hoveredHandler && this.hoveredHandler !== handler) {
      this.hoveredHandler.onHoverLeave?.(point, event);
      this.eventBus.dispatch("lighter:overlay-unhover", {
        id: this.hoveredHandler.id,
        point,
      });
      this.hoveredHandler = undefined;
      return;
    }

    // If we are hovering on a new overlay, hover the new one
    if (handler && this.hoveredHandler !== handler && !movingHandler) {
      handler.onHoverEnter?.(point, event);
      this.canvas.style.cursor =
        handler.getCursor?.(worldPoint, scale) || this.canvas.style.cursor;

      this.eventBus.dispatch("lighter:overlay-hover", {
        id: handler.id,
        point,
      });
    }

    // If we are hovering on the same overlay, move the hover
    if (this.hoveredHandler === handler) {
      this.canvas.style.cursor =
        handler.getCursor?.(worldPoint, scale) || this.canvas.style.cursor;

      this.eventBus.dispatch("lighter:overlay-hover-move", {
        id: handler.id,
        point,
      });
    }

    // Update the hovered handler
    this.hoveredHandler = handler;
  }

  private handleZoomed = (
    _event: LighterEventGroup["lighter:zoomed"]
  ): void => {
    this.handlers?.forEach((handler) => handler.markDirty());
  };

  private isDoubleClick(point: Point, now: number): boolean {
    if (!this.lastClickPoint || !this.lastClickTime) return false;

    const timeDiff = now - this.lastClickTime;
    const distance = Math.sqrt(
      Math.pow(point.x - this.lastClickPoint.x, 2) +
        Math.pow(point.y - this.lastClickPoint.y, 2)
    );

    return (
      timeDiff <= this.DOUBLE_CLICK_TIME_THRESHOLD &&
      distance <= this.DOUBLE_CLICK_DISTANCE_THRESHOLD
    );
  }

  private getInteractiveHandler(): InteractiveDetectionHandler | undefined {
    return this.handlers.find((h) => h instanceof InteractiveDetectionHandler);
  }

  /**
   * Finds the handler at the given point using a priority-based selection algorithm.
   *
   * This method determines which interaction handler should handle events at a specific point
   * by considering multiple factors in the following priority order:
   *
   * 1. **Selected handlers** (highest priority): If any handler at the point is currently
   *    selected, it takes precedence over all others. This ensures selected overlays always
   *    receive interaction events, even when overlapping with other handlers.
   *
   * 2. **Selectable handlers with selection priority**: If no selected handler is found, the
   *    method prefers selectable handlers with higher selection priority values. This allows
   *    certain overlay types to be prioritized for interaction (e.g., bounding boxes over
   *    classifications).
   *
   * 3. **Topmost handler** (fallback): If no special priorities apply, the handler that appears
   *    topmost in the rendering order (last in the handlers array) is returned.
   *
   * @param point - The point to check for handler intersection.
   * @param skipCanonicalMedia - If true, the canonical media handler is excluded from consideration.
   * @returns The handler that should handle events at the point, or undefined if no handler
   *          contains the point.
   */
  private findHandlerAtPoint(
    point: Point,
    skipCanonicalMedia: boolean = false
  ): InteractionHandler | undefined {
    // Find handlers in reverse order (topmost first)
    // Note: this is a hack, we need a better z-order logic
    const candidates: InteractionHandler[] = [];
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const handler = this.handlers[i];

      if (skipCanonicalMedia && handler.id === this.canonicalMediaId) {
        continue;
      }

      if (handler.containsPoint(point)) {
        candidates.push(handler);
      }
    }

    if (candidates.length === 0) return undefined;
    if (candidates.length === 1) return candidates[0];

    // First, check if any candidates are selected - selected overlays override everything
    const selectedCandidates = candidates.filter((handler) => {
      if (TypeGuards.isSelectable(handler)) {
        return this.selectionManager.isSelected(handler.id);
      }
      return false;
    });

    if (selectedCandidates.length > 0) {
      return selectedCandidates[0];
    }

    // If multiple handlers found, prefer selectable ones with higher priority
    const selectableCandidates = candidates.filter((handler) =>
      TypeGuards.isSelectable(handler)
    );

    if (selectableCandidates.length > 0) {
      // Choose the selectable candidate with highest selection priority
      return selectableCandidates.reduce((best, current) => {
        const bestPriority = TypeGuards.isSelectable(best)
          ? best.getSelectionPriority()
          : 0;
        const currentPriority = TypeGuards.isSelectable(current)
          ? current.getSelectionPriority()
          : 0;
        return currentPriority > bestPriority ? current : best;
      });
    }

    // Fall back to the first candidate (topmost)
    return candidates[0];
  }

  private getCanvasPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    const screenPoint = {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };

    return screenPoint;
  }

  /**
   * Adds an interaction handler.
   * @param handler - The handler to add.
   */
  addHandler(handler: InteractionHandler): void {
    this.handlers.push(handler);
  }

  /**
   * Removes an interaction handler.
   * @param handler - The handler to remove.
   */
  removeHandler(handler: InteractionHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      const removedHandler = this.handlers.splice(index, 1);

      if (removedHandler?.at?.(0)) {
        removedHandler[0].cleanup?.();
      }
    }

    // Clear references if this was the active handler
    if (this.hoveredHandler === handler) {
      this.hoveredHandler = undefined;
    }
  }

  /**
   * Resets the hovered handler to undefined.
   */
  public resetHoveredHandler(): void {
    this.hoveredHandler = undefined;
  }

  /**
   * Clears all handlers.
   */
  clearHandlers(): void {
    this.handlers = [];
    this.hoveredHandler = undefined;
  }

  /**
   * Destroys the interaction manager and removes event listeners.
   */
  destroy(): void {
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    document.removeEventListener("keydown", this.handleKeyDown);
    document.removeEventListener("keyup", this.handleKeyUp);
    this.eventBus.off("lighter:zoomed", this.handleZoomed);
    this.clearHandlers();
  }

  /**
   * Finds a handler by its ID.
   * @param id - The ID of the handler to find.
   * @returns The handler if found, undefined otherwise.
   */
  findHandlerById(id: string): InteractionHandler | undefined {
    return this.handlers.find((handler) => handler.id === id);
  }

  /**
   * Finds a handler that is being dragged or resized.
   * @returns The handler if found, undefined otherwise.
   */
  findMovingHandler(): InteractionHandler | undefined {
    return this.handlers.find(
      (handler) => handler.isMoving && handler.isMoving()
    );
  }

  /**
   * Reorders handlers to match the overlay order.
   * Handlers for overlays that appear later in the overlay order should be processed first for interaction.
   * This maintains strict coupling between overlay rendering order and interaction priority.
   *
   * The coupling ensures that:
   * 1. Overlays rendered on top (later in overlayOrder) are processed first for interaction
   * 2. When overlay order changes, interaction priority changes accordingly
   * 3. The visual z-order matches the interaction z-order
   *
   * @param overlayOrder - Array of overlay IDs in the desired order (from bottom to top).
   */
  reorderHandlers(overlayOrder: string[]): void {
    // Create a map of overlay ID to handler for quick lookup
    const handlerMap = new Map<string, InteractionHandler>();
    for (const handler of this.handlers) {
      handlerMap.set(handler.id, handler);
    }

    // Reorder handlers to match overlay order (reverse for interaction priority)
    const reorderedHandlers: InteractionHandler[] = [];

    // Process overlay order from bottom to top, but add handlers in reverse order
    // so that topmost overlays (later in overlayOrder) are processed first for interaction
    // for (let i = overlayOrder.length - 1; i >= 0; i--) {
    for (let i = 0; i < overlayOrder.length; i++) {
      const overlayId = overlayOrder[i];
      const handler = handlerMap.get(overlayId);
      if (handler) {
        reorderedHandlers.push(handler);
      }
    }

    // Add any remaining handlers that weren't in the overlay order
    for (const handler of this.handlers) {
      if (!overlayOrder.includes(handler.id)) {
        reorderedHandlers.push(handler);
      }
    }

    this.handlers = reorderedHandlers;
  }
}
