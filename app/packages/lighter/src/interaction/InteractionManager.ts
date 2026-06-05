/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { detectionModeBridge } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/bridgeDetectionMode";
import { segmentationModeBridge } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/bridgeSegmentationMode";
import { EventDispatcher, getEventBus } from "@fiftyone/events";
import type { ClickEventModifiers } from "@fiftyone/utilities";
import { TypeGuards } from "../core/Scene2D";
import type { LighterEventGroup } from "../events";
import {
  SegmentationTool,
  type SegmentationToolState,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import { DetectionOverlay } from "../overlay/DetectionOverlay";
import { KeypointOverlay } from "../overlay/KeypointOverlay";
import type { InteractionState } from "../overlay/DetectionOverlay";
import type { BaseOverlay } from "../overlay/BaseOverlay";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { SelectionManager } from "../selection/SelectionManager";
import type { Point, Rect } from "../types";
import { buildBrushCursor } from "./buildBrushCursor";
import { InteractiveCreationHandler } from "./InteractiveCreationHandler";
import { InteractiveDetectionHandler } from "./InteractiveDetectionHandler";
import { InteractiveKeypointHandler } from "./InteractiveKeypointHandler";
import { InteractivePenHandler } from "./InteractivePenHandler";
import { InteractivePolylineHandler } from "./InteractivePolylineHandler";
import { v4 as generateUUID } from "uuid";

/**
 * Unified event object passed to overlay interaction handlers.
 * Contains all pointer-event context needed for down / move / up handling.
 */
export interface OverlayEvent {
  /** Canvas-space (screen-space) pointer position. */
  point: Point;
  /** World-space pointer position (after inverse camera transform). */
  worldPoint: Point;
  /** The original DOM pointer event. */
  event: PointerEvent;
  /** Current camera zoom scale factor. */
  scale: number;
  /** Whether shift-key aspect-ratio lock is active. */
  maintainAspectRatio?: boolean;
  /** Segmentation painting tool state, if segmentation mode is active. */
  segmentationToolState?: SegmentationToolState;
}

/**
 * Handler invoked on pointer-down before overlay selection runs. Returning
 * `true` claims the event: the manager skips selection and detection-mode
 * handling, captures the pointer, and prevents the default DOM action.
 * Returning `false` / `undefined` lets default behavior run.
 */
export type EmptyCanvasClickHandler = (
  worldPoint: Point,
  point: Point,
  event: PointerEvent
) => boolean | void;

/**
 * Predicate for interactive handlers that own their own pointer-event
 * dispatch (drag, hit-testing, etc.) and shouldn't have events forwarded to
 * their `getOverlay()`. The default routing — defer to the wrapped overlay —
 * applies to creation handlers like {@link InteractiveDetectionHandler}.
 */
function isSelfManagedInteractiveHandler(handler: InteractionHandler): boolean {
  return (
    handler instanceof InteractiveKeypointHandler ||
    handler instanceof InteractivePolylineHandler ||
    handler instanceof InteractivePenHandler ||
    handler instanceof InteractiveCreationHandler
  );
}

/**
 * Interface for handlers that support sub-selecting and removing individual
 * points (e.g. keypoint overlays).
 */
export interface KeypointMutationHandler {
  getSelectedPointIndex(): number | null;
  removePoint(index: number): void;
}

function hasKeypointMutation(
  h: InteractionHandler
): h is InteractionHandler & KeypointMutationHandler {
  return (
    "getSelectedPointIndex" in h &&
    "removePoint" in h &&
    typeof (h as Record<string, unknown>).getSelectedPointIndex ===
      "function" &&
    typeof (h as Record<string, unknown>).removePoint === "function"
  );
}

/**
 * Interface for objects that can handle interaction events from the
 * {@link InteractionManager}.
 *
 * Overlays (e.g. {@link DetectionOverlay}) implement this interface directly.
 * Ephemeral helpers like {@link InteractiveDetectionHandler} wrap an overlay
 * and act as a proxy during drag-to-create flows.
 */
export interface InteractionHandler {
  /** Unique identifier, typically the overlay or handler ID. */
  readonly id: string;
  /** Default CSS cursor while this handler is hovered. */
  readonly cursor?: string;
  /** The overlay this handler is managing, if any. */
  overlay?: BaseOverlay;

  /** Returns true if the handler is being interacted with */
  isInteracting?(): boolean;
  /** Returns true if the handler is being dragged. */
  isDragging?(): boolean;
  /** Returns true if the handler is being resized. */
  isResizing?(): boolean;
  /** Returns true if the handler is selected. */
  isSelected?(): boolean;
  /** Returns true if a new DetectionOverlay is being created. */
  isSetting?(): boolean;

  /**
   * Returns the type of cursor that is currently appropriate
   * @param worldPoint - Current screen location translated to viewport location.
   * @param scale - The current scaling factor of the renderer.
   * @param modifiers - Current keyboard modifier state. Tracked by the
   *  manager across both pointer and key events, so cursor can react to
   *  alt/shift/etc. presses even when the mouse is still.
   */
  getCursor?(
    worldPoint: Point,
    scale: number,
    modifiers?: ClickEventModifiers
  ): string;

  /**
   * Notification that the global modifier state changed. Fired by the
   * manager on key press/release while this handler is installed, so
   * handlers can react to modifier changes without a pointer move
   * (e.g. hide the preview line on shift-press for new-segment intent).
   *
   * `worldPoint` is the cursor's last known world position, or `null`
   * when no pointer event has been observed yet.
   */
  onModifiersChanged?(
    modifiers: ClickEventModifiers,
    worldPoint: Point | null
  ): void;

  /** Returns the current state of the handler */
  getInteractionState?(): InteractionState;
  /** Returns the position from the start of handler movement */
  getMoveStartPosition?(): Point | undefined;
  /** Returns the position from the start of handler movement */
  getMoveStartBounds?(): Rect | undefined;
  /** Returns the overlay associated with the manager. */
  getOverlay?(): BaseOverlay | undefined;
  /** Called when a pointer-down occurs on this handler. */
  onPointerDown?(params: OverlayEvent): boolean;
  /** Called on pointer-move while this handler is active. */
  onMove?(params: OverlayEvent): boolean;
  /** Called when the pointer is released. */
  onPointerUp?(params: OverlayEvent): boolean;
  /** Single-click handler. */
  onClick?(point: Point, event: PointerEvent, scale: number): boolean;
  /** Double-click handler. */
  onDoubleClick?(point: Point, event: PointerEvent): boolean;
  /** Called when the pointer enters this handler's hit area. */
  onHoverEnter?(point: Point | null, event: PointerEvent | null): boolean;
  /** Called when the pointer leaves this handler's hit area. */
  onHoverLeave?(point?: Point | null, event?: PointerEvent | null): boolean;

  /**
   * Notification that the pointer has left the canvas. Fired by the manager
   * on `pointerleave` for the active interactive handler.
   */
  onCanvasLeave?(): void;

  /**
   * Handle hover move event.
   * @param point - The point where the event occurred.
   * @param event - The original pointer event.
   * @returns True if the event was handled.
   */
  /** Called on pointer-move while hovering (no button pressed). */
  onHoverMove?(point?: Point | null, event?: PointerEvent | null): boolean;

  /** Forces the overlay to be in hovered state. */
  forceHoverEnter?(): void;
  /** Forces the overlay to be in unhovered state. */
  forceHoverLeave?(): void;
  /** Hit-test: does the given point fall within this handler's area? */
  containsPoint(point: Point): boolean;
  /** Marks the overlay as dirty, indicating it needs to be re-rendered. */
  markDirty(): void;
  /** Release any resources held by the handler. */
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

  /**
   * Current modifier state, refreshed from both pointer events and
   * document key events so handlers can react to modifier changes
   * (e.g. alt-hover cursor swap) without requiring a pointer move.
   */
  private currentModifiers: ClickEventModifiers = {
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
  };

  private canonicalMediaId?: string;

  private emptyCanvasClickHandler?: EmptyCanvasClickHandler;

  // Configuration
  private readonly CLICK_THRESHOLD = 3; // pixels, dictates drag vs. click
  private readonly DRAG_TIME_THRESHOLD = 500; // ms, dictates drag vs. click
  private readonly DOUBLE_CLICK_TIME_THRESHOLD = 500; // ms
  private readonly DOUBLE_CLICK_DISTANCE_THRESHOLD = 3; // pixels

  private currentPixelCoordinates?: Point;

  // Hover handling is rAF-coalesced.
  // Multiple pointermoves between frames collapse into one hover update.
  // Drag/onMove dispatch is intentionally NOT coalesced — sub-frame precision
  // matters for precise edits.
  private pendingHoverRaf: number | null = null;
  private latestHoverPoint?: Point;
  private latestHoverEvent?: PointerEvent;
  private latestHoverHandler?: InteractionHandler;

  private readonly eventBus: EventDispatcher<LighterEventGroup>;

  private pendingAction?: {
    point: Point;
    worldPoint: Point;
    scale: number;
    pointerId: number;
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private selectionManager: SelectionManager,
    private renderer: Renderer2D,
    eventChannel: string
  ) {
    this.eventBus = getEventBus<LighterEventGroup>(eventChannel);
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
    this.canvas.addEventListener("contextmenu", this.handleRightClick);
    document.addEventListener("keydown", this.handleKeyDown);
    document.addEventListener("keyup", this.handleKeyUp);
    this.eventBus.on("lighter:zoomed", this.handleZoomed);
  }

  private handlePointerDown = (event: PointerEvent): void => {
    // ignore right click, handled by `handleRightClick`
    if (event.button === 2) return;

    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();

    this.syncModifiersFromEvent(event);

    this.clickStartTime = Date.now();
    this.clickStartPoint = point;

    let handler: InteractionHandler | undefined = undefined;
    const interactiveHandler = this.getInteractiveHandler();

    if (interactiveHandler) {
      handler = isSelfManagedInteractiveHandler(interactiveHandler)
        ? // self-managed handlers route their own pointer events
          interactiveHandler
        : // otherwise defer to the handler's overlay
          interactiveHandler.getOverlay?.();

      if (interactiveHandler?.getOverlay?.()) {
        this.selectionManager.select(interactiveHandler.getOverlay().id);
      }
    } else {
      handler = this.findHandlerAtPoint(point);
      // Prevent pan/zoom when target is selectable
      if (handler && TypeGuards.isSelectable(handler)) {
        this.renderer.disableZoomPan();
      }

      // Generic canvas-click claim: a registered consumer can claim the click
      // before selection runs
      if (
        this.emptyCanvasClickHandler &&
        this.emptyCanvasClickHandler(worldPoint, point, event)
      ) {
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      // If clicking an overlay, select it
      const isUnselectedOverlay =
        !!handler &&
        TypeGuards.isSelectable(handler) &&
        !this.selectionManager.isSelected(handler.id);

      if (isUnselectedOverlay) {
        this.selectionManager.select(handler!.id);
      }

      // Detection mode: defer overlay creation until we confirm this is a drag.
      // If the user releases without dragging (a click), exit detection mode.
      // Clicking on an existing overlay selects it normally instead.
      if (detectionModeBridge.isActive() || segmentationModeBridge.isActive()) {
        const isNonOverlay = !handler || handler.id === this.canonicalMediaId;

        const isSelectInSegmentation =
          segmentationModeBridge.isActive() &&
          segmentationModeBridge.getActiveTool() === SegmentationTool.Select;

        if (isNonOverlay && !isSelectInSegmentation) {
          this.renderer.disableZoomPan();

          this.pendingAction = {
            point,
            worldPoint,
            scale,
            pointerId: event.pointerId,
          };

          this.canvas.setPointerCapture(event.pointerId);
          event.preventDefault();
          return;
        }
      }
    }

    if (
      handler?.onPointerDown?.({
        point,
        worldPoint,
        event,
        scale,
        segmentationToolState: segmentationModeBridge.getToolState(scale),
      })
    ) {
      const cursor = handler.getCursor?.(
        worldPoint,
        scale,
        this.currentModifiers
      );
      if (cursor) {
        this.canvas.style.cursor = cursor;
      }

      // If this is a spatial overlay with move state, track drag/resize lifecycle.
      // Handlers that manage their own drag events (e.g. KeypointOverlay point
      // drags) don't provide getMoveStartBounds/getMoveStartPosition, so we skip
      // dispatching to avoid stranded start events with no matching end.
      // Capture move start state before the type guard narrows `handler` away
      // from InteractionHandler (which defines these optional methods).
      const startPosition = handler.getMoveStartPosition?.();
      const startBounds = handler.getMoveStartBounds?.();

      if (TypeGuards.isSpatial(handler) && startPosition && startBounds) {
        const type: keyof LighterEventGroup = handler.isDragging?.()
          ? "lighter:overlay-drag-start"
          : "lighter:overlay-resize-start";

        this.eventBus.dispatch(type, {
          id: handler.id,
          startPosition,
          bounds: startBounds,
        });
      }

      // Self-managed interactive handlers don't go through the selectable
      // disableZoomPan branch above, so a point drag would otherwise compete
      // with renderer pan. Suppress while the handler reports itself as
      // dragging; pointerup re-enables.
      if (handler.isDragging?.()) {
        this.renderer.disableZoomPan();
      }

      this.canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };

  private configureCursorStyle(
    handler: InteractionHandler,
    worldPoint: Point,
    scale: number
  ): void {
    if (
      segmentationModeBridge.isActive() &&
      segmentationModeBridge.getActiveTool() === SegmentationTool.Merge
    ) {
      const isMergeable =
        handler instanceof DetectionOverlay &&
        handler.hasMask() &&
        handler.id !== segmentationModeBridge.getMergeTargetId();
      this.canvas.style.cursor = isMergeable ? "cell" : "default";
      return;
    }

    if (TypeGuards.isSelectable(handler) && !handler.isSelected?.()) {
      this.canvas.style.cursor = "pointer";
    } else if (segmentationModeBridge.isActive()) {
      this.canvas.style.cursor = buildBrushCursor(
        segmentationModeBridge.getToolState(scale)!
      );
    } else if (TypeGuards.isInteractionHandler(handler) && handler.getCursor) {
      this.canvas.style.cursor = handler.getCursor(
        worldPoint,
        scale,
        this.currentModifiers
      );
    }
  }

  // Promote pending detection mode event once drag threshold is exceeded.
  private detectionModeCreate = (event: PointerEvent): boolean => {
    if (!this.pendingAction) return false;

    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();
    this.currentPixelCoordinates = point;

    const pending = this.pendingAction;
    this.pendingAction = undefined;

    // Signal detection mode to create a detection and register
    // an interactive handler. This relies on the event bus invoking
    // handlers synchronously so the handler is immediately available.
    this.eventBus.dispatch("lighter:overlay-create", {
      eventId: generateUUID(),
    });

    const interactiveHandler = this.getInteractiveHandler();
    if (interactiveHandler) {
      const handler = interactiveHandler.getOverlay();
      this.selectionManager.select(handler.id);

      // Initialize the handler with the original pointerdown point
      handler.onPointerDown?.({
        point: pending.point,
        worldPoint: pending.worldPoint,
        event,
        scale: pending.scale,
      });

      // Update with the current pointer position
      handler.onMove?.({
        point,
        worldPoint,
        event,
        scale,
        maintainAspectRatio: this.maintainAspectRatio,
      });

      if (TypeGuards.isSpatial(handler)) {
        this.eventBus.dispatch("lighter:overlay-drag-start", {
          id: handler.id,
          startPosition: handler.bounds,
          bounds: handler.bounds,
        });
      }

      this.configureCursorStyle(handler, worldPoint, scale);
    }

    return true;
  };

  /**
   * Called from handlePointerMove. If a segmentation action is pending and the
   * pointer has moved beyond the click threshold, forward the deferred
   * pointer-down to the handler to start painting.
   */
  private segmentationModePaint = (event: PointerEvent): boolean => {
    if (!this.pendingAction) return false;

    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();
    this.currentPixelCoordinates = point;

    const pending = this.pendingAction;
    this.pendingAction = undefined;

    const editingSegmentation =
      segmentationModeBridge.isActive() &&
      this.selectionManager.getSelectionCount() > 0;

    if (!editingSegmentation) {
      this.eventBus.dispatch("lighter:overlay-create", {
        eventId: generateUUID(),
      });
    }

    const handler = this.getActiveHandler();

    if (handler) {
      this.selectionManager.select(handler.id);

      // Forward the deferred pointer-down to start painting
      handler.onPointerDown?.({
        point: pending.point,
        worldPoint: pending.worldPoint,
        event,
        scale: pending.scale,
        segmentationToolState: segmentationModeBridge.getToolState(
          pending.scale
        ),
      });

      // Apply the current move
      handler.onMove?.({
        point,
        worldPoint,
        event,
        scale,
        maintainAspectRatio: this.maintainAspectRatio,
        segmentationToolState: segmentationModeBridge.getToolState(scale),
      });

      if (TypeGuards.isSpatial(handler)) {
        this.eventBus.dispatch("lighter:overlay-drag-start", {
          id: handler.id,
          startPosition: handler.bounds,
          bounds: handler.bounds,
        });
      }

      this.configureCursorStyle(handler, worldPoint, scale);
    }

    return true;
  };

  private handlePendingMove = (event: PointerEvent): boolean => {
    if (!this.pendingAction) return false;

    const point = this.getCanvasPoint(event);
    this.currentPixelCoordinates = point;

    const distance = Math.hypot(
      point.x - this.pendingAction.point.x,
      point.y - this.pendingAction.point.y
    );

    if (distance > this.CLICK_THRESHOLD) {
      if (detectionModeBridge.isActive()) {
        return this.detectionModeCreate(event);
      }

      if (segmentationModeBridge.isActive()) {
        return this.segmentationModePaint(event);
      }
    }

    return false;
  };

  private handlePointerMove = (event: PointerEvent): void => {
    // short-circuit if pending segmentation or detection mode operation kicks off
    if (this.handlePendingMove(event)) return;

    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();
    this.currentPixelCoordinates = point;
    this.syncModifiersFromEvent(event);

    const interactiveHandler = this.getInteractiveHandler();
    const interactingHandler = this.findInteractingHandler();

    // Skip the full handler scan when a pointer-move is already owned.
    // Interactive editing pins `handler` to the interactive handler, and
    // drag pins it to the interacting handler
    let hitHandler: InteractionHandler | undefined;
    let handler: InteractionHandler | undefined;

    if (interactiveHandler || interactingHandler) {
      handler = interactingHandler || interactiveHandler;

      if (!interactiveHandler) {
        // Drag, no interactive editing. Still schedule a hover update so
        // handleHover's reordered `interactingHandler` branch can dispatch
        // the unhover for whichever overlay was hovered when the drag began.
        this.scheduleHoverUpdate(
          this.currentPixelCoordinates,
          event,
          undefined
        );
      }
    } else {
      hitHandler = this.findHandlerAtPoint(point);
      handler = hitHandler;
      this.scheduleHoverUpdate(this.currentPixelCoordinates, event, hitHandler);
    }

    // To determine drag behavior, we allow for two cases:
    //  1. A spatial drag indicates that the pointer has moved a sufficient
    //    distance from its starting point. We allow for some epsilon of
    //    movement to allow for normal clicks to move a few pixels.
    //  2. A temporal drag indicates that the pointer has been pressed for a
    //    sufficient period of time.
    //  By combining both spatial and temporal drags, we can prevent accidental
    //  dragging behavior when clicking (via spatial gate), while still
    //  allowing for pixel-level drag precision (via temporal gate).
    // const isDrag = this.isTemporalDrag() || this.isSpatialDragEvent(event);
    //
    // todo - update handlers to be "sticky" - if a drag starts from a handler,
    //  that handler should continue to process events even if the pointer
    //  moves beyond its bounds.

    // Apply drag gate to prevent accidental overlay dragging on click
    if (handler) {
      const moveParams: OverlayEvent = {
        point,
        worldPoint,
        event,
        scale,
        maintainAspectRatio: this.maintainAspectRatio,
        segmentationToolState: segmentationModeBridge.getToolState(scale),
      };

      // Handle drag move
      if (!interactiveHandler) {
        handler.onMove?.(moveParams);
      } else {
        handler = isSelfManagedInteractiveHandler(interactiveHandler)
          ? // self-managed handlers route their own move events
            interactiveHandler
          : // otherwise defer to the handler's overlay
            interactiveHandler.getOverlay();

        handler.onMove?.(moveParams);
      }

      if (handler.isInteracting?.()) {
        // Emit move event with bounds information
        if (TypeGuards.isSpatial(handler)) {
          const type = handler.isDragging?.()
            ? "lighter:overlay-drag-move"
            : "lighter:overlay-resize-move";

          this.eventBus.dispatch(type, {
            id: handler.id,
            bounds: handler.bounds,
          });
        }

        event.preventDefault();
      }
    }

    // Treat the canonical-media overlay as "no overlay" so the creation-mode
    // fallbacks can fire when the user is hovering over the blank image
    const cursorHandler =
      handler && handler.id !== this.canonicalMediaId ? handler : undefined;

    if (cursorHandler) {
      this.configureCursorStyle(cursorHandler, worldPoint, scale);
    } else if (segmentationModeBridge.isActive() && !interactiveHandler) {
      const isMergeTool =
        segmentationModeBridge.getActiveTool() === SegmentationTool.Merge;

      this.canvas.style.cursor = isMergeTool
        ? "default"
        : buildBrushCursor(segmentationModeBridge.getToolState(scale)!);
    } else if (detectionModeBridge.isActive() && !interactiveHandler) {
      this.canvas.style.cursor = "crosshair";
    }
  };

  private clearPendingAction = (event: PointerEvent) => {
    this.pendingAction = undefined;
    this.renderer.enableZoomPan();
    this.canvas.releasePointerCapture(event.pointerId);
    this.clickStartPoint = undefined;
    this.clickStartTime = 0;
  };

  private detectionModeQuit = (event: PointerEvent): boolean => {
    if (!this.pendingAction) return false;

    this.eventBus.dispatch("lighter:detection-mode-quit", {
      eventId: generateUUID(),
    });

    this.clearPendingAction(event);

    return true;
  };

  private segmentationEditDone = (event: PointerEvent): boolean => {
    if (!this.pendingAction) return false;

    this.selectionManager.clearSelection();

    this.clearPendingAction(event);

    return true;
  };

  /**
   * Called from handlePointerUp. If an action is still pending (no
   * significant movement), the user clicked to quit — establish the overlay
   * and remove the interactive handler.
   */
  private handlePendingUp = (event: PointerEvent): boolean => {
    if (!this.pendingAction) return false;

    if (detectionModeBridge.isActive()) {
      return this.detectionModeQuit(event);
    }

    if (segmentationModeBridge.isActive()) {
      // No brush selected — click exits segmentation mode entirely
      if (segmentationModeBridge.getActiveTool() === SegmentationTool.Select) {
        this.eventBus.dispatch("lighter:segmentation-mode-quit", {
          eventId: generateUUID(),
        });

        this.clearPendingAction(event);

        return true;
      }

      // AI tool: point selection handles clicks via InteractiveKeypointHandler;
      // if a pending action somehow reaches here, discard it.
      if (segmentationModeBridge.getActiveTool() === SegmentationTool.AI) {
        this.clearPendingAction(event);
        return true;
      }

      // Pen tool: forward click to the overlay to add a point.
      if (segmentationModeBridge.getActiveTool() === SegmentationTool.Pen) {
        this.segmentationModePaint(event);
        return false;
      }

      // a detection is being edited but this click is outside its bounds
      // close out the current detection
      if (this.selectionManager.getSelectionCount() >= 0) {
        return this.segmentationEditDone(event);
      }

      // if we are not currently editing
      // the click should create a new detection
      // return false so the rest of handlePointerUp executes
      if (this.selectionManager.getSelectionCount() === 0) {
        this.segmentationModePaint(event);
        return false;
      }
    }

    return false;
  };

  private handlePointerUp = (event: PointerEvent): void => {
    if (this.handlePendingUp(event)) return;

    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();
    const now = Date.now();

    this.syncModifiersFromEvent(event);

    let handler: InteractionHandler | undefined = undefined;

    const interactiveHandler = this.getInteractiveHandler();

    if (interactiveHandler) {
      handler = isSelfManagedInteractiveHandler(interactiveHandler)
        ? // self-managed handlers route their own pointer-up events
          interactiveHandler
        : // otherwise defer to the handler's overlay
          interactiveHandler.getOverlay();
    } else {
      handler = this.findInteractingHandler() || this.findHandlerAtPoint(point);
    }

    if (handler?.isInteracting?.()) {
      const interactionState = handler.getInteractionState?.();
      const startBounds = handler.getMoveStartBounds?.();
      const startPosition = handler.getMoveStartPosition?.();

      // Handle drag end
      handler.onPointerUp?.({
        point,
        worldPoint,
        event,
        scale,
        segmentationToolState: segmentationModeBridge.getToolState(scale),
      });

      if (
        interactiveHandler &&
        !isSelfManagedInteractiveHandler(interactiveHandler)
      ) {
        // Self-managed handlers outlive a single drag and are torn down
        // explicitly via exitInteractiveMode instead.
        this.removeHandler(interactiveHandler);
      }

      // Emit move end event with bounds information
      if (TypeGuards.isSpatial(handler) && startBounds && startPosition) {
        const detail = {
          id: handler.id,
          startBounds,
          startPosition,
          endPosition: handler.bounds,
          bounds: handler.bounds,
        };

        if (interactionState === "SETTING" || interactionState === "PAINTING") {
          if (interactiveHandler) {
            this.eventBus.dispatch("lighter:overlay-establish", {
              ...detail,
              handler: interactiveHandler,
            });
          }
        } else {
          const type =
            interactionState === "DRAGGING"
              ? "lighter:overlay-drag-end"
              : "lighter:overlay-resize-end";
          this.eventBus.dispatch(type, detail);
        }
      }

      this.canvas.releasePointerCapture(event.pointerId);
      event.preventDefault();
    } else if (handler && !handler.isInteracting?.()) {
      // This was a click, not a drag - handle as click for selection
      this.handleClick(point, event, now);

      // Clean up drag handler
      handler.onPointerUp?.({ point, worldPoint, event, scale });
      this.canvas.releasePointerCapture(event.pointerId);
    } else {
      // Handle click
      this.handleClick(point, event, now);
    }

    this.renderer.enableZoomPan();
    this.canvas.style.cursor =
      handler?.getCursor?.(worldPoint, scale, this.currentModifiers) ||
      this.canvas.style.cursor;
    this.clickStartPoint = undefined;
    this.clickStartTime = 0;
  };

  private handlePointerCancel = (event: PointerEvent): void => {
    if (this.pendingAction) {
      this.pendingAction = undefined;
      this.renderer.enableZoomPan();
    }

    const interactingHandler = this.findInteractingHandler();

    if (interactingHandler) {
      this.canvas.releasePointerCapture(event.pointerId);
      // Re-enable zoom/pan after drag cancellation
      this.renderer.enableZoomPan();
    }
  };

  private handlePointerLeave = (event: PointerEvent): void => {
    // Cancel next hover cycle; no longer on the canvas
    this.cancelPendingHover();

    // Clear hover state when leaving canvas
    if (this.hoveredHandler) {
      const point = this.getCanvasPoint(event);
      this.hoveredHandler.onHoverLeave?.(point, event);
      this.hoveredHandler = undefined;
    }

    this.getInteractiveHandler()?.onCanvasLeave?.();
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
  private handleKeyDown = async (event: KeyboardEvent): Promise<void> => {
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

    this.syncModifiersFromEvent(event);

    if (event.shiftKey) {
      this.maintainAspectRatio = event.shiftKey;
      return;
    }

    // Delete/Backspace: remove sub-selected keypoint
    if (event.key === "Delete" || event.key === "Backspace") {
      const selectedId = this.selectionManager.getSelectedIds()[0];
      if (selectedId) {
        const handler = this.handlers.find((h) => h.id === selectedId);
        if (handler && hasKeypointMutation(handler)) {
          const idx = handler.getSelectedPointIndex();
          if (idx !== null && idx >= 0) {
            handler.removePoint(idx);
            event.preventDefault();
          }
        }
      }
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

    this.syncModifiersFromEvent(event);

    this.maintainAspectRatio = event.shiftKey;
  };

  /**
   * Snapshot modifier state from a pointer or keyboard event. If anything
   * changed and we have a self-managed interactive handler installed, push
   * a fresh cursor. Without this, a handler can't react to modifier
   * changes (e.g. alt-press) until the next pointer move.
   */
  private syncModifiersFromEvent(event: PointerEvent | KeyboardEvent): void {
    const next: ClickEventModifiers = {
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
    };

    const changed =
      next.altKey !== this.currentModifiers.altKey ||
      next.ctrlKey !== this.currentModifiers.ctrlKey ||
      next.metaKey !== this.currentModifiers.metaKey ||
      next.shiftKey !== this.currentModifiers.shiftKey;

    this.currentModifiers = next;

    if (!changed) {
      return;
    }

    const interactiveHandler = this.getInteractiveHandler();
    if (
      !interactiveHandler ||
      !isSelfManagedInteractiveHandler(interactiveHandler)
    ) {
      return;
    }

    const pixel = this.currentPixelCoordinates;
    const worldPoint = pixel ? this.renderer.screenToWorld(pixel) : null;

    interactiveHandler.onModifiersChanged?.(this.currentModifiers, worldPoint);

    if (worldPoint && interactiveHandler.getCursor) {
      const cursor = interactiveHandler.getCursor(
        worldPoint,
        this.renderer.getScale(),
        this.currentModifiers
      );
      if (cursor) {
        this.canvas.style.cursor = cursor;
      }
    }
  }

  private handleClick(point: Point, event: PointerEvent, now: number): void {
    if (!this.clickStartPoint || !this.clickStartTime) return;

    // Check if this is a valid click (not a drag)
    if (!this.isSpatialDragEvent(event)) {
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

  /**
   * Three-tier right-click behavior:
   *
   * 1. **Finalize active editing** (pen polygon, AI point selection) —
   *    commit the in-progress work to the overlay, keep it selected and
   *    in editing mode.
   * 2. **Stop editing the current label** (brush/eraser, bbox adjustments) —
   *    deselect the label but remain in the current mode.
   * 3. **Exit the current mode** (detection, segmentation) —
   *    quit the mode entirely and return to Select.
   */
  private handleRightClick = (event: PointerEvent) => {
    event.preventDefault();

    const point = this.getCanvasPoint(event);
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();

    const interactiveHandler = this.getInteractiveHandler();
    const handler =
      interactiveHandler?.getOverlay?.() || this.findSelectedHandler();

    // ---- Tier 1: Finalize active editing ----

    if (segmentationModeBridge.isActive()) {
      const tool = segmentationModeBridge.getActiveTool();

      // Pen tool with an in-progress polygon: commit it
      if (tool === SegmentationTool.Pen && handler?.hasPenPolygon?.()) {
        const segmentationToolState =
          segmentationModeBridge.getToolState(scale);

        handler.commitPenPolygon({
          point,
          worldPoint,
          event,
          scale,
          segmentationToolState,
        });

        if (interactiveHandler instanceof InteractivePenHandler) {
          // Replace the per-point undo entries with the single
          // PaintStrokeCommand emitted by commitPenPolygon. The handler stays
          // installed so the user can keep drawing more polygons.
          interactiveHandler.pruneCommands();
        } else if (interactiveHandler) {
          // First-click case: an InteractiveDetectionHandler still wraps the
          // freshly-created overlay. Tear it down and emit overlay-establish
          // so the AddOverlayCommand makes it into the undo stack.
          this.removeHandler(interactiveHandler);
          this.eventBus.dispatch("lighter:overlay-establish", {
            id: handler.id,
            handler: interactiveHandler,
            startBounds: handler.bounds,
            startPosition: { x: handler.bounds.x, y: handler.bounds.y },
            bounds: handler.bounds,
          });
        }

        return;
      }

      if (tool === SegmentationTool.AI && interactiveHandler) {
        // For the keypoint overlay backing AI point selection,
        // `hasValidBounds()` is true iff points have been placed — use it
        // as the "session had in-progress work" signal so the bridge can
        // tier between finalize and step-back-to-Select.
        const overlay = interactiveHandler.getOverlay?.();
        const pointsEstablished =
          overlay instanceof KeypointOverlay && overlay.hasValidBounds();

        interactiveHandler.resetOverlay();
        this.removeHandler(interactiveHandler);

        if (pointsEstablished) {
          this.eventBus.dispatch("lighter:point-selection-finalize", {
            eventId: generateUUID(),
          });

          return;
        }
      }
    }

    // ---- Tier 2: Stop editing the current label, remain in mode ----

    if (this.selectionManager.getSelectionCount() > 0) {
      this.selectionManager.clearSelection();
      return;
    }

    // ---- Tier 3: Exit the current mode ----
    //
    // Mode-agnostic dispatch; mode-specific handlers can decide whether they
    // should deactivate
    this.eventBus.dispatch("lighter:active-mode-quit-requested", {
      eventId: generateUUID(),
    });
  };

  /**
   * Coalesces hover work onto a single rAF callback. Multiple pointermoves
   * between frames overwrite the stored point/handler; only the latest is
   * processed when the rAF fires. Caller must already have resolved the
   * hover target via {@link findHandlerAtPoint} (or pass `undefined` to
   * trigger hover-clear).
   */
  private scheduleHoverUpdate(
    point: Point,
    event: PointerEvent,
    resolvedHandler: InteractionHandler | undefined
  ): void {
    this.latestHoverPoint = point;
    this.latestHoverEvent = event;
    this.latestHoverHandler = resolvedHandler;

    if (this.pendingHoverRaf !== null) {
      return;
    }

    this.pendingHoverRaf = requestAnimationFrame(() => {
      this.pendingHoverRaf = null;
      const latestPoint = this.latestHoverPoint;
      const latestEvent = this.latestHoverEvent;
      // A handler removed via removeHandler/clearHandlers between
      // scheduling and now is stale.
      // Drop the ref so it can be GC'd before the next frame.
      const cached = this.latestHoverHandler;
      this.latestHoverHandler = undefined;
      const latestHandler =
        cached && this.handlers.includes(cached) ? cached : undefined;

      if (latestPoint && latestEvent) {
        this.handleHover(latestPoint, latestEvent, latestHandler);
      }
    });
  }

  /**
   * Cancels any pending hover rAF and drops the latest cached point/event.
   */
  private cancelPendingHover(): void {
    if (this.pendingHoverRaf !== null) {
      cancelAnimationFrame(this.pendingHoverRaf);
      this.pendingHoverRaf = null;
    }

    this.latestHoverPoint = undefined;
    this.latestHoverEvent = undefined;
    this.latestHoverHandler = undefined;
  }

  private handleHover(
    point: Point,
    event: PointerEvent,
    resolvedHandler: InteractionHandler | undefined
  ): void {
    const worldPoint = this.renderer.screenToWorld(point);
    const scale = this.renderer.getScale();

    // Hover target is pre-resolved by the caller (single hit-test per
    // pointermove). `undefined` means either nothing under the cursor or a
    // drag is active and hover should be cleared.
    const handler = resolvedHandler;
    const interactingHandler = this.findInteractingHandler();

    // If we are dragging, we should unhover the previous one
    if (interactingHandler) {
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

    if (!handler || handler.id === this.canonicalMediaId) {
      // Skip the "default" cursor write when a creation mode is active —
      // handlePointerMove's synchronous fallback writes the mode cursor
      // (crosshair for detection mode, brush for segmentation) on every
      // event, and this rAF runs later. Writing "default" here would
      // overwrite that, producing the flicker between mode cursor and
      // "default" reported during bounding-box creation.
      if (
        !segmentationModeBridge.isActive() &&
        !detectionModeBridge.isActive()
      ) {
        this.canvas.style.cursor = "default";
      }

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
    if (handler && this.hoveredHandler !== handler && !interactingHandler) {
      handler.onHoverEnter?.(point, event);
      this.canvas.style.cursor =
        handler.getCursor?.(worldPoint, scale, this.currentModifiers) ||
        this.canvas.style.cursor;

      this.eventBus.dispatch("lighter:overlay-hover", {
        id: handler.id,
        point,
      });
    }

    // If we are hovering on the same overlay, move the hover
    if (this.hoveredHandler === handler) {
      this.canvas.style.cursor =
        handler.getCursor?.(worldPoint, scale, this.currentModifiers) ||
        this.canvas.style.cursor;

      this.eventBus.dispatch("lighter:overlay-hover-move", {
        id: handler.id,
        point,
      });
    }

    // Update the hovered handler
    this.hoveredHandler = handler;
    this.configureCursorStyle(handler, worldPoint, scale);
  }

  private handleZoomed = (
    _event: LighterEventGroup["lighter:zoomed"]
  ): void => {
    this.handlers?.forEach((handler) => handler.markDirty());

    if (!segmentationModeBridge.isActive()) return;

    if (segmentationModeBridge.getActiveTool() === SegmentationTool.Merge) {
      const handler = this.hoveredHandler;
      const isMergeable =
        handler instanceof DetectionOverlay &&
        handler.hasMask() &&
        handler.id !== segmentationModeBridge.getMergeTargetId();
      this.canvas.style.cursor = isMergeable ? "cell" : "default";

      return;
    }

    const scale = this.renderer.getScale();
    this.canvas.style.cursor = buildBrushCursor(
      segmentationModeBridge.getToolState(scale)!
    );
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

  private getInteractiveHandler(): InteractionHandler | undefined {
    // self-managed handlers take precedence to allow editing on top of
    // other overlays
    const selfManaged = this.handlers.find((h) =>
      isSelfManagedInteractiveHandler(h)
    );

    return (
      selfManaged ??
      this.handlers.find((h) => h instanceof InteractiveDetectionHandler)
    );
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
    // Single-pass: find best handler at point using priority rules.
    // Priority: selected > highest selectable priority > topmost (reverse order).
    let bestSelected: InteractionHandler | undefined;
    let bestSelectable: InteractionHandler | undefined;
    let bestSelectablePriority = -1;
    let topmost: InteractionHandler | undefined;

    for (let i = this.handlers.length - 1; i >= 0; i--) {
      const handler = this.handlers[i];

      if (skipCanonicalMedia && handler.id === this.canonicalMediaId) {
        continue;
      }

      if (!handler.containsPoint(point)) {
        continue;
      }

      if (!topmost) topmost = handler;

      if (TypeGuards.isSelectable(handler)) {
        if (!bestSelected && this.selectionManager.isSelected(handler.id)) {
          bestSelected = handler;
        }
        const priority = handler.getSelectionPriority();
        if (priority > bestSelectablePriority) {
          bestSelectablePriority = priority;
          bestSelectable = handler;
        }
      }
    }

    return bestSelected || bestSelectable || topmost;
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
   * Returns whether the event should be considered a spatial drag.
   *
   * This method checks whether the event's position exceeds the spatial gate
   * specified by {@link CLICK_THRESHOLD}.
   *
   * @param event Pointer event
   * @private
   */
  private isSpatialDragEvent(event: PointerEvent): boolean {
    if (this.clickStartPoint) {
      const point = this.getCanvasPoint(event);
      const distanceSquared =
        Math.pow(point.x - this.clickStartPoint.x, 2) +
        Math.pow(point.y - this.clickStartPoint.y, 2);

      return distanceSquared > this.CLICK_THRESHOLD * this.CLICK_THRESHOLD;
    }

    return false;
  }

  /**
   * Returns whether the current time should be considered a temporal drag.
   *
   * This method checks whether the delta between the current time and the
   * initial pointerdown time exceeds the temporal gate specified by
   * {@link DRAG_TIME_THRESHOLD}.
   *
   * @private
   */
  private isTemporalDrag(): boolean {
    if (this.clickStartTime) {
      return Date.now() - this.clickStartTime > this.DRAG_TIME_THRESHOLD;
    }

    return false;
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
   * Registers a handler invoked on pointer-down events before overlay
   * selection runs. The handler decides whether to claim the click; can be
   * used to take precedence over * selecting an underlying overlay.
   * Pass `null` to clear.
   */
  setEmptyCanvasClickHandler(handler: EmptyCanvasClickHandler | null): void {
    this.emptyCanvasClickHandler = handler ?? undefined;
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
    for (const handler of this.handlers) {
      handler.cleanup?.();
    }
    this.handlers = [];
    this.hoveredHandler = undefined;
  }

  /**
   * Destroys the interaction manager and removes event listeners.
   */
  destroy(): void {
    this.cancelPendingHover();
    this.canvas.removeEventListener("pointerdown", this.handlePointerDown);
    this.canvas.removeEventListener("pointermove", this.handlePointerMove);
    this.canvas.removeEventListener("pointerup", this.handlePointerUp);
    this.canvas.removeEventListener("pointercancel", this.handlePointerCancel);
    this.canvas.removeEventListener("pointerleave", this.handlePointerLeave);
    this.canvas.removeEventListener("wheel", this.handleWheel);
    this.canvas.removeEventListener("contextmenu", this.handleRightClick);
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
   * Finds the first selected handler
   * @returns The handler if found, undefined otherwise.
   */
  findSelectedHandler(): InteractionHandler | undefined {
    return this.handlers.find((handler) => handler.isSelected?.());
  }

  /**
   * Finds a handler that is being interacted with.
   * @returns The handler if found, undefined otherwise.
   */
  findInteractingHandler(): InteractionHandler | undefined {
    return this.handlers.find((handler) => handler.isInteracting?.());
  }

  /**
   * Returns the current active handler.
   * @returns The active handler if found, undefined otherwise.
   */
  getActiveHandler(): InteractionHandler | undefined {
    const interactiveHandler = this.getInteractiveHandler();
    const handler =
      interactiveHandler?.getOverlay?.() || this.findSelectedHandler();

    return handler;
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
    const overlayOrderSet = new Set(overlayOrder);
    for (const handler of this.handlers) {
      if (!overlayOrderSet.has(handler.id)) {
        reorderedHandlers.push(handler);
      }
    }

    this.handlers = reorderedHandlers;
  }
}
