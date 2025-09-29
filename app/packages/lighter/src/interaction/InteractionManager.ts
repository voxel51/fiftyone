/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Movable } from "../commands/MoveOverlayCommand";
import { UndoRedoManager } from "../commands/UndoRedoManager";
import { TypeGuards } from "../core/Scene2D";
import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { SelectionManager } from "../selection/SelectionManager";
import type { Point } from "../types";
import { InteractiveDetectionHandler } from "./InteractiveDetectionHandler";

/**
 * Interface for objects that can handle interaction events.
 */
export interface InteractionHandler {
  readonly id: string;
  readonly cursor?: string;

  /**
   * Handle pointer down event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled and should not propagate.
   */
  onPointerDown?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle pointer move event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onDrag?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle pointer up event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onPointerUp?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle click event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onClick?(point: Point, event: PointerEvent): boolean;

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
   * Check if this handler can handle events at the given point.
   * @param point - The point to test.
   * @returns True if this handler can handle events at the point.
   */
  containsPoint(point: Point): boolean;

  /**
   * Release any resources held by the handler.
   */
  cleanup?(): void;
}

/**
 * Drag state information for tracking overlay movements.
 */
interface DragState {
  overlay: BaseOverlay & Movable;
  startPoint: Point;
  startPosition: Point;
}

/**
 * Manages all interaction events and coordinates with overlays.
 * Now knows about overlays and manages drag state internally.
 */
export class InteractionManager {
  private handlers: InteractionHandler[] = [];
  private dragHandler?: InteractionHandler;
  private hoveredHandler?: InteractionHandler;
  private isDragging = false;
  private clickStartTime = 0;
  private clickStartPoint?: Point;
  private lastClickTime = 0;
  private lastClickPoint?: Point;

  private canonicalMediaId?: string;

  // Drag state management
  private dragState?: DragState;

  // Configuration
  private readonly CLICK_THRESHOLD = 0.1;
  private readonly CLICK_TIME_THRESHOLD = 300; // ms
  private readonly DOUBLE_CLICK_TIME_THRESHOLD = 500; // ms
  private readonly DOUBLE_CLICK_DISTANCE_THRESHOLD = 10; // pixels

  private currentPixelCoordinates?: Point;

  constructor(
    private canvas: HTMLCanvasElement,
    private eventBus: EventBus,
    private undoRedoManager: UndoRedoManager,
    private selectionManager: SelectionManager,
    private renderer: Renderer2D
  ) {
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
    document.addEventListener("keydown", this.handleKeyDown);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    this.clickStartTime = Date.now();
    this.clickStartPoint = point;

    let handler: InteractionHandler | undefined = undefined;

    const interactiveHandler = this.getInteractiveHandler();

    if (interactiveHandler) {
      handler = interactiveHandler;
    } else {
      handler = this.findHandlerAtPoint(point);
    }

    if (handler && this.selectionManager.isSelected(handler.id)) {
      this.canvas.style.cursor = "grabbing";
    }

    if (handler?.onPointerDown?.(point, event)) {
      this.dragHandler = handler;

      // If this is a movable overlay, track drag state
      if (TypeGuards.isMovable(handler)) {
        this.dragState = {
          overlay: handler,
          startPoint: point,
          startPosition: handler.getPosition(),
        };

        if (TypeGuards.isSpatial(handler)) {
          this.eventBus.emit({
            type: LIGHTER_EVENTS.OVERLAY_DRAG_START,
            detail: {
              id: handler.id,
              startPosition: this.dragState.startPosition,
              absoluteBounds: handler.getAbsoluteBounds(),
              relativeBounds: handler.getRelativeBounds(),
            },
          });
        }
      }

      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    this.currentPixelCoordinates = this.getCanvasPoint(event);

    const handler = this.findHandlerAtPoint(this.currentPixelCoordinates);
    const isSelected = handler && this.selectionManager.isSelected(handler.id);

    const interactiveHandler = this.getInteractiveHandler();

    if (!interactiveHandler) {
      // we don't want to handle hover in interactive mode
      // for instance, no tooltips, no hover states, etc
      this.handleHover(this.currentPixelCoordinates, event, this.isDragging);
    }

    if (this.dragHandler && !this.isDragging && isSelected) {
      // Check if we've moved enough to start dragging
      if (this.clickStartPoint) {
        const distance = Math.sqrt(
          Math.pow(this.currentPixelCoordinates.x - this.clickStartPoint.x, 2) +
            Math.pow(this.currentPixelCoordinates.y - this.clickStartPoint.y, 2)
        );

        if (distance > this.CLICK_THRESHOLD) {
          this.isDragging = true;
          // Disable zoom/pan to prevent interference during overlay dragging
          this.renderer.disableZoomPan();
        }
      }
    }

    if (this.isDragging && this.dragHandler) {
      // Handle drag move
      if (!interactiveHandler) {
        this.dragHandler.onDrag?.(this.currentPixelCoordinates, event);
      } else {
        interactiveHandler.onDrag?.(this.currentPixelCoordinates, event);
      }

      // Emit drag move event with bounds information
      if (this.dragState && TypeGuards.isSpatial(this.dragState.overlay)) {
        this.eventBus.emit({
          type: LIGHTER_EVENTS.OVERLAY_DRAG_MOVE,
          detail: {
            id: this.dragState.overlay.id,
            absoluteBounds: this.dragState.overlay.getAbsoluteBounds(),
            relativeBounds: this.dragState.overlay.getRelativeBounds(),
          },
        });
      }

      event.preventDefault();
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    const handler = this.findHandlerAtPoint(point);
    const now = Date.now();

    if (handler && this.selectionManager.isSelected(handler.id)) {
      this.canvas.style.cursor = "grab";
    }

    if (this.isDragging && this.dragHandler) {
      // Handle drag end
      this.dragHandler.onPointerUp?.(point, event);

      // Emit drag end event with bounds information
      if (this.dragState && TypeGuards.isSpatial(this.dragState.overlay)) {
        this.eventBus.emit({
          type: LIGHTER_EVENTS.OVERLAY_DRAG_END,
          detail: {
            id: this.dragState.overlay.id,
            startPosition: this.dragState.startPosition,
            endPosition: this.dragState.overlay.getPosition(),
            absoluteBounds: this.dragState.overlay.getAbsoluteBounds(),
            relativeBounds: this.dragState.overlay.getRelativeBounds(),
          },
        });
      }

      this.canvas.releasePointerCapture(event.pointerId);
      this.isDragging = false;
      this.dragHandler = undefined;
      this.dragState = undefined;
      // Re-enable zoom/pan after overlay dragging ends
      this.renderer.enableZoomPan();
      event.preventDefault();
    } else if (this.dragHandler && !this.isDragging) {
      // This was a click, not a drag - handle as click for selection
      this.handleClick(point, event, now);

      // Clean up drag handler
      this.dragHandler.onPointerUp?.(point, event);
      this.canvas.releasePointerCapture(event.pointerId);
      this.dragHandler = undefined;
      this.dragState = undefined;
    } else {
      // Handle click
      this.handleClick(point, event, now);
    }
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (this.isDragging && this.dragHandler) {
      this.canvas.releasePointerCapture(event.pointerId);
      this.isDragging = false;
      this.dragHandler = undefined;
      this.dragState = undefined;
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

  /**
   * Handles keyboard events for undo/redo shortcuts.
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
      const handler = this.findHandlerAtPoint(point);

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
      else if (handler?.onClick?.(point, event)) {
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

  private handleHover(
    point: Point,
    event: PointerEvent,
    isDragging: boolean
  ): void {
    const handler = this.findHandlerAtPoint(point);

    if (!handler || handler.id === this.canonicalMediaId) {
      this.canvas.style.cursor = "default";

      if (this.hoveredHandler) {
        this.hoveredHandler.onHoverLeave?.(point, event);

        this.eventBus?.emit({
          type: LIGHTER_EVENTS.OVERLAY_UNHOVER,
          detail: { id: this.hoveredHandler.id, point },
        });

        this.eventBus?.emit({
          type: LIGHTER_EVENTS.OVERLAY_ALL_UNHOVER,
          detail: { point },
        });
      }

      this.hoveredHandler = undefined;

      return;
    }

    if (!this.selectionManager.isSelected(handler.id)) {
      this.canvas.style.cursor = "pointer";
    } else if (isDragging) {
      this.canvas.style.cursor = "grabbing";
    } else {
      this.canvas.style.cursor = "grab";
    }

    // If we are dragging, we should unhover the previous one
    if (isDragging) {
      if (this.hoveredHandler) {
        this.hoveredHandler.onHoverLeave?.(point, event);
        this.eventBus?.emit({
          type: LIGHTER_EVENTS.OVERLAY_UNHOVER,
          detail: { id: this.hoveredHandler.id, point },
        });
        this.hoveredHandler = undefined;
      }
      return;
    }

    // If we are hovering on a different overlay, unhover the previous one
    if (this.hoveredHandler && this.hoveredHandler !== handler) {
      this.hoveredHandler.onHoverLeave?.(point, event);
      this.eventBus?.emit({
        type: LIGHTER_EVENTS.OVERLAY_UNHOVER,
        detail: { id: this.hoveredHandler.id, point },
      });
      this.hoveredHandler = undefined;
      return;
    }

    // If we are hovering on a new overlay, hover the new one
    if (handler && this.hoveredHandler !== handler) {
      handler.onHoverEnter?.(point, event);

      this.eventBus?.emit({
        type: LIGHTER_EVENTS.OVERLAY_HOVER,
        detail: { id: handler.id, point },
      });
    }

    // If we are hovering on the same overlay, move the hover
    if (this.hoveredHandler === handler) {
      handler.onHoverMove?.(point, event);

      this.eventBus.emit({
        type: LIGHTER_EVENTS.OVERLAY_HOVER_MOVE,
        detail: { id: handler.id, point },
      });
    }

    // Update the hovered handler
    this.hoveredHandler = handler;
  }

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

  private getInteractiveHandler(): InteractionHandler | undefined {
    return this.handlers.find((h) => h instanceof InteractiveDetectionHandler);
  }

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

    // If multiple handlers found, prefer selectable ones with higher priority
    const selectableCandidates = candidates.filter((handler) =>
      TypeGuards.isSelectable(handler)
    );

    if (selectableCandidates.length > 0) {
      // Choose the selectable candidate with highest selection priority
      return selectableCandidates.reduce((best, current) => {
        const bestPriority = (best as any).getSelectionPriority?.() || 0;
        const currentPriority = (current as any).getSelectionPriority?.() || 0;
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

    // if there's interactive handler, convert to world coordinates
    // todo: make this simpler
    const interactiveHandler = this.getInteractiveHandler();
    if (interactiveHandler) {
      return this.renderer.screenToWorld(screenPoint);
    }

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
    if (this.dragHandler === handler) {
      this.dragHandler = undefined;
      this.isDragging = false;
      this.dragState = undefined;
    }
    if (this.hoveredHandler === handler) {
      this.hoveredHandler = undefined;
    }
  }

  /**
   * Clears all handlers.
   */
  clearHandlers(): void {
    this.handlers = [];
    this.dragHandler = undefined;
    this.hoveredHandler = undefined;
    this.isDragging = false;
    this.dragState = undefined;
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
    document.removeEventListener("keydown", this.handleKeyDown);
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
