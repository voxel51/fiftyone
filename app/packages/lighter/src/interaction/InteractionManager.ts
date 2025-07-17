/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { EventBus } from "../event/EventBus";
import { LIGHTER_EVENTS } from "../event/EventBus";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Selectable } from "../selection/Selectable";
import type { SelectionManager } from "../selection/SelectionManager";
import type { Point } from "../types";
import type { Movable } from "../undo/MoveOverlayCommand";
import { MoveOverlayCommand } from "../undo/MoveOverlayCommand";
import { UndoRedoManager } from "../undo/UndoRedoManager";

/**
 * Interface for objects that can handle interaction events.
 */
export interface InteractionHandler {
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
  onPointerMove?(point: Point, event: PointerEvent): boolean;

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
  onHoverEnter?(point: Point, event: PointerEvent): boolean;

  /**
   * Handle hover leave event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  onHoverLeave?(point: Point, event: PointerEvent): boolean;

  /**
   * Check if this handler can handle events at the given point.
   * @param point - The point to test.
   * @returns True if this handler can handle events at the point.
   */
  containsPoint(point: Point): boolean;
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

  // Drag state management
  private dragState?: DragState;

  // Selection management
  private selectionManager: SelectionManager;

  // Configuration
  private readonly CLICK_THRESHOLD = 5; // pixels
  private readonly CLICK_TIME_THRESHOLD = 300; // ms
  private readonly DOUBLE_CLICK_TIME_THRESHOLD = 500; // ms
  private readonly DOUBLE_CLICK_DISTANCE_THRESHOLD = 10; // pixels

  private undoRedoManager: UndoRedoManager;
  private getOverlayById: (id: string) => BaseOverlay | undefined;

  constructor(
    private canvas: HTMLCanvasElement,
    private eventBus: EventBus,
    undoRedoManager: UndoRedoManager,
    selectionManager: SelectionManager,
    getOverlayById: (id: string) => BaseOverlay | undefined
  ) {
    this.undoRedoManager = undoRedoManager;
    this.selectionManager = selectionManager;
    this.getOverlayById = getOverlayById;
    this.setupEventListeners();
    this.setupDragEventListeners();
    this.setupSpatialEventListeners();
  }

  private setupEventListeners(): void {
    this.canvas.addEventListener("pointerdown", this.handlePointerDown, {
      passive: false,
    });
    this.canvas.addEventListener("pointermove", this.handlePointerMove, {
      passive: false,
    });
    this.canvas.addEventListener("pointerup", this.handlePointerUp, {
      passive: false,
    });
    this.canvas.addEventListener("pointercancel", this.handlePointerCancel, {
      passive: false,
    });
    this.canvas.addEventListener("pointerleave", this.handlePointerLeave, {
      passive: false,
    });

    // Prevent context menu on right-click
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  private setupDragEventListeners(): void {
    this.eventBus.on(LIGHTER_EVENTS.OVERLAY_DRAG_END, (event) => {
      console.log("OVERLAY_DRAG_END", event);
      const overlay = this.getOverlayById(event.detail.id);
      if (overlay && this.isMovableOverlay(overlay)) {
        const { startPosition, endPosition } = event.detail;
        const moved =
          Math.abs(startPosition.x - endPosition.x) > 1 ||
          Math.abs(startPosition.y - endPosition.y) > 1;
        if (moved) {
          const moveCommand = new MoveOverlayCommand(
            overlay,
            event.detail.id,
            startPosition,
            endPosition
          );
          this.undoRedoManager.push(moveCommand);
        }
      }
    });
  }

  private setupSpatialEventListeners(): void {
    this.eventBus.on(LIGHTER_EVENTS.SPATIAL_SHIFT, (event) => {
      this.handleSpatialShift(event.detail);
    });
    this.eventBus.on(LIGHTER_EVENTS.SPATIAL_RESIZE, (event) => {
      this.handleSpatialResize(event.detail);
    });
    this.eventBus.on(LIGHTER_EVENTS.SPATIAL_MOVE, (event) => {
      this.handleSpatialMove(event.detail);
    });
  }

  private handleSpatialShift(detail: {
    targetIds?: string[];
    deltaX: number;
    deltaY: number;
  }): void {
    const targetIds =
      detail.targetIds || this.selectionManager.getSelectedIds();
    for (const id of targetIds) {
      const overlay = this.getOverlayById(id);
      if (overlay && "getPosition" in overlay && "setPosition" in overlay) {
        const movable = overlay as any;
        const currentPos = movable.getPosition();
        movable.setPosition({
          x: currentPos.x + detail.deltaX,
          y: currentPos.y + detail.deltaY,
        });
        if ("markDirty" in overlay) {
          (overlay as any).markDirty();
        }
      }
    }
  }

  private handleSpatialResize(detail: {
    targetIds?: string[];
    deltaWidth: number;
    deltaHeight: number;
  }): void {
    const targetIds =
      detail.targetIds || this.selectionManager.getSelectedIds();
    for (const id of targetIds) {
      const overlay = this.getOverlayById(id);
      if (overlay && "getBounds" in overlay && "setBounds" in overlay) {
        const resizable = overlay as any;
        const currentBounds = resizable.getBounds();
        resizable.setBounds({
          x: currentBounds.x,
          y: currentBounds.y,
          width: Math.max(1, currentBounds.width + detail.deltaWidth),
          height: Math.max(1, currentBounds.height + detail.deltaHeight),
        });
        if ("markDirty" in overlay) {
          (overlay as any).markDirty();
        }
      }
    }
  }

  private handleSpatialMove(detail: {
    targetIds?: string[];
    newX: number;
    newY: number;
  }): void {
    const targetIds =
      detail.targetIds || this.selectionManager.getSelectedIds();
    for (const id of targetIds) {
      const overlay = this.getOverlayById(id);
      if (overlay && "setPosition" in overlay) {
        const movable = overlay as any;
        movable.setPosition({
          x: detail.newX,
          y: detail.newY,
        });
        if ("markDirty" in overlay) {
          (overlay as any).markDirty();
        }
      }
    }
  }

  private handlePointerDown = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    this.clickStartTime = Date.now();
    this.clickStartPoint = point;

    // Find the topmost handler that can handle this point
    const handler = this.findHandlerAtPoint(point);
    if (handler?.onPointerDown?.(point, event)) {
      // Store the handler but don't set isDragging yet
      // Wait to see if there's actual movement
      this.dragHandler = handler;

      // If this is a movable overlay, track drag state
      if (this.isMovableOverlay(handler)) {
        this.dragState = {
          overlay: handler,
          startPoint: point,
          startPosition: handler.getPosition(),
        };

        // Emit drag start with complete information
        this.eventBus.emit({
          type: LIGHTER_EVENTS.OVERLAY_DRAG_START,
          detail: {
            id: handler.id,
            startPoint: point,
            startPosition: this.dragState.startPosition,
          },
        });
      }

      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private handlePointerMove = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);

    if (this.dragHandler && !this.isDragging) {
      // Check if we've moved enough to start dragging
      if (this.clickStartPoint) {
        const distance = Math.sqrt(
          Math.pow(point.x - this.clickStartPoint.x, 2) +
            Math.pow(point.y - this.clickStartPoint.y, 2)
        );

        if (distance > this.CLICK_THRESHOLD) {
          this.isDragging = true;
        }
      }
    }

    if (this.isDragging && this.dragHandler) {
      // Handle drag move
      this.dragHandler.onPointerMove?.(point, event);

      // Emit drag move event with delta information
      if (this.dragState) {
        const delta = {
          x: point.x - this.dragState.startPoint.x,
          y: point.y - this.dragState.startPoint.y,
        };

        this.eventBus.emit({
          type: LIGHTER_EVENTS.OVERLAY_DRAG_MOVE,
          detail: {
            id: this.dragState.overlay.id,
            currentPoint: point,
            delta,
            startPosition: this.dragState.startPosition,
            currentPosition: this.dragState.overlay.getPosition(),
          },
        });
      }

      event.preventDefault();
    } else {
      // Handle hover
      this.handleHover(point, event);
    }
  };

  private handlePointerUp = (event: PointerEvent): void => {
    const point = this.getCanvasPoint(event);
    const now = Date.now();

    if (this.isDragging && this.dragHandler) {
      // Handle drag end
      this.dragHandler.onPointerUp?.(point, event);

      // Emit drag end event with complete movement information
      if (this.dragState) {
        const totalDelta = {
          x: point.x - this.dragState.startPoint.x,
          y: point.y - this.dragState.startPoint.y,
        };

        const endPosition = this.dragState.overlay.getPosition();

        this.eventBus.emit({
          type: LIGHTER_EVENTS.OVERLAY_DRAG_END,
          detail: {
            id: this.dragState.overlay.id,
            endPoint: point,
            totalDelta,
            startPosition: this.dragState.startPosition,
            endPosition,
          },
        });
      }

      this.canvas.releasePointerCapture(event.pointerId);
      this.isDragging = false;
      this.dragHandler = undefined;
      this.dragState = undefined;
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
      if (handler && this.isSelectableHandler(handler)) {
        const addToSelection = event.ctrlKey || event.metaKey; // Ctrl/Cmd+click to add to selection
        this.selectionManager.toggle(handler.id, addToSelection);
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

  private handleHover(point: Point, event: PointerEvent): void {
    const handler = this.findHandlerAtPoint(point);

    if (handler !== this.hoveredHandler) {
      // Leave previous handler
      if (this.hoveredHandler) {
        this.hoveredHandler.onHoverLeave?.(point, event);
      }

      // Enter new handler
      if (handler) {
        handler.onHoverEnter?.(point, event);
      }

      this.hoveredHandler = handler;
    }
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

  private findHandlerAtPoint(point: Point): InteractionHandler | undefined {
    // Find handlers in reverse order (topmost first)
    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const handler = this.handlers[i];
      if (handler.containsPoint(point)) {
        return handler;
      }
    }
    return undefined;
  }

  private getCanvasPoint(event: PointerEvent): Point {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    };
  }

  /**
   * Type guard to check if a handler is a movable overlay.
   */
  private isMovableOverlay(
    handler: InteractionHandler
  ): handler is BaseOverlay & Movable {
    return (
      "id" in handler &&
      "getPosition" in handler &&
      "setPosition" in handler &&
      typeof (handler as any).getPosition === "function" &&
      typeof (handler as any).setPosition === "function"
    );
  }

  /**
   * Type guard to check if a handler is selectable.
   */
  private isSelectableHandler(
    handler: InteractionHandler
  ): handler is InteractionHandler & Selectable {
    return (
      "id" in handler &&
      "isSelected" in handler &&
      typeof (handler as any).isSelected === "function"
    );
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
      this.handlers.splice(index, 1);
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
    this.clearHandlers();
  }
}
