/**
 * Copyright 2017-2025, Voxel51, Inc.
 */

import type { Movable } from "../commands/MoveOverlayCommand";
import {
  DEFAULT_TEXT_PADDING,
  LABEL_ARCHETYPE_PRIORITY,
  STROKE_WIDTH,
  EDGE_THRESHOLD,
} from "../constants";
import { CONTAINS } from "../core/Scene2D";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type {
  BoundedOverlay,
  Hoverable,
  Point,
  RawLookerLabel,
  Rect,
  Spatial,
} from "../types";
import {
  getInstanceStrokeStyles,
  getSimpleStrokeStyles,
} from "../utils/colorMapping";
import { distanceFromLineSegment } from "../utils/geometry";
import { BaseOverlay } from "./BaseOverlay";

export type BoundingBoxLabel = RawLookerLabel & {
  label: string;
  bounding_box: number[];
  confidence?: number;
};

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOptions {
  sampleId: string;
  // Relative bounds [0,1]
  relativeBounds?: Rect;
  label: BoundingBoxLabel;
  confidence?: number;
  draggable?: boolean;
  resizeable?: boolean;
  selectable?: boolean;
  field?: string;
}

export type ResizeRegion =
  | "RESIZE_N"
  | "RESIZE_NE"
  | "RESIZE_E"
  | "RESIZE_SE"
  | "RESIZE_S"
  | "RESIZE_SW"
  | "RESIZE_W"
  | "RESIZE_NW";

export type MoveState = ResizeRegion | "NONE" | "DRAGGING";

/**
 * Bounding box overlay implementation with drag support, selection, and spatial coordinates.
 */
export class BoundingBoxOverlay
  extends BaseOverlay
  implements Movable, Selectable, BoundedOverlay, Spatial, Hoverable
{
  private isDraggable: boolean;
  private isResizeable: boolean;
  private moveState: MoveState = "NONE";
  private moveStartPoint?: Point;
  private moveStartPosition?: Point;
  private moveStartBounds?: Rect;
  private isSelectedState = false;
  private relativeBounds: Rect;
  private absoluteBounds: Rect;

  private _needsCoordinateUpdate = false;
  private textBounds?: Rect;

  public cursor = "pointer";
  private readonly CLICK_THRESHOLD = 0.1;

  constructor(private options: BoundingBoxOptions) {
    const id =
      options.label["_id"] ??
      options.label.id ??
      `bbox_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    super(id, options.sampleId, options.label, options.field);
    this.isDraggable = options.draggable !== false;
    this.isResizeable = options.resizeable !== false;

    // Initialize bounds
    if (options.relativeBounds) {
      this.relativeBounds = { ...options.relativeBounds };
      this.absoluteBounds = { x: 0, y: 0, width: 0, height: 0 }; // Will be set by scene
      this._needsCoordinateUpdate = true;
    } else {
      throw new Error("Either bounds or relativeBounds must be provided");
    }
  }

  getOverlayType(): string {
    return "BoundingBoxOverlay";
  }

  // Spatial interface implementation
  getRelativeBounds(): Rect {
    return { ...this.relativeBounds };
  }

  setAbsoluteBounds(bounds: Rect): void {
    this.absoluteBounds = { ...bounds };
    this._needsCoordinateUpdate = false;
    this.markDirty();
  }

  setRelativeBounds(bounds: Rect): void {
    this.relativeBounds = { ...bounds };
    this._needsCoordinateUpdate = true;
    this.markDirty();
  }

  getAbsoluteBounds(): Rect {
    return { ...this.absoluteBounds };
  }

  needsCoordinateUpdate(): boolean {
    return this._needsCoordinateUpdate;
  }

  markForCoordinateUpdate(): void {
    this._needsCoordinateUpdate = true;
    this.markDirty();
  }

  markCoordinateUpdateComplete(): void {
    this._needsCoordinateUpdate = false;
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const style = this.currentStyle;

    if (!style) return;

    // Check if this label has an instance to determine stroke styling
    const hasInstance = this.options.label.instance?._id !== undefined;

    // Get stroke styles based on whether the label has an instance
    const { strokeColor, overlayStrokeColor, overlayDash, hoverStrokeColor } =
      hasInstance
        ? getInstanceStrokeStyles({
            isSelected: this.isSelectedState,
            strokeColor: style.strokeStyle || "#000000",
            isHovered: this.isHoveredState,
            dashLength: 8,
          })
        : getSimpleStrokeStyles({
            isSelected: this.isSelectedState,
            strokeColor: style.strokeStyle || "#ffffff",
            isHovered: this.isHoveredState,
            dashLength: 8,
          });

    const mainStrokeStyle = {
      ...style,
      strokeStyle: strokeColor,
      isSelected: this.isSelectedState,
    };

    if (style.dashPattern && !overlayStrokeColor && !overlayDash) {
      mainStrokeStyle.dashPattern = style.dashPattern;
    }

    renderer.drawRect(this.absoluteBounds, mainStrokeStyle, this.containerId);

    if (hoverStrokeColor) {
      renderer.drawRect(
        this.absoluteBounds,
        {
          strokeStyle: hoverStrokeColor,
          lineWidth: style.lineWidth || 2,
        },
        this.containerId
      );
    } else if (overlayStrokeColor && overlayDash) {
      renderer.drawRect(
        this.absoluteBounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: style.lineWidth,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId
      );
    }

    if (this.options.label && this.options.label.label?.length > 0) {
      const offset = style.lineWidth
        ? style.lineWidth / renderer.getScale() / 2
        : 0;

      const labelPosition = this.isSelected()
        ? {
            x: this.absoluteBounds.x + offset * 6,
            y: this.absoluteBounds.y - offset * 3,
          }
        : {
            x: this.absoluteBounds.x - offset,
            y: this.absoluteBounds.y - offset,
          };

      let textToDraw = this.options.label.label;

      if (
        typeof this.options.label.confidence !== "undefined" &&
        !isNaN(this.options.label.confidence)
      ) {
        textToDraw += ` (${this.options.label.confidence.toFixed(2)})`;
      }

      // Draw text and store the dimensions for accurate header detection
      const textDimensions = renderer.drawText(
        textToDraw,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
        },
        this.containerId
      );

      this.textBounds = {
        x: labelPosition.x,
        y: labelPosition.y,
        width: textDimensions.width,
        height: textDimensions.height,
      };
    }

    this.emitLoaded();
  }

  // Movable interface implementation
  getPosition(): Point {
    return {
      x: this.absoluteBounds.x,
      y: this.absoluteBounds.y,
    };
  }

  setPosition(position: Point): void {
    this.absoluteBounds = {
      ...this.absoluteBounds,
      x: position.x,
      y: position.y,
    };

    this.markForCoordinateUpdate();
  }

  getMoveStartPosition(): Point | undefined {
    return this.moveStartPosition;
  }

  private calculateMoving(point: Point, worldPoint: Point, scale: number) {
    if (!this.isSelected() || !this.moveStartPoint || this.moveState !== "NONE")
      return;

    const distance = Math.sqrt(
      Math.pow((point.x - this.moveStartPoint.x) / scale, 2) +
        Math.pow((point.y - this.moveStartPoint.y) / scale, 2)
    );

    if (distance > this.CLICK_THRESHOLD) {
      const resizeRegion = this.getResizeRegion(worldPoint, scale);
      this.moveState = resizeRegion || "DRAGGING";
    }
  }

  isMoving() {
    return this.moveState !== "NONE";
  }

  isDragging() {
    return this.moveState === "DRAGGING";
  }

  isResizing() {
    return this.moveState.startsWith("RESIZE_");
  }

  private getResizeRegion(
    worldPoint: Point,
    scale: number
  ): ResizeRegion | null {
    const { x, y, height, width } = this.absoluteBounds;

    const isNorth = worldPoint.y <= y + EDGE_THRESHOLD / scale;
    const isEast = worldPoint.x >= x + width - EDGE_THRESHOLD / scale;
    const isSouth = worldPoint.y >= y + height - EDGE_THRESHOLD / scale;
    const isWest = worldPoint.x <= x + EDGE_THRESHOLD / scale;

    return isNorth && isWest
      ? "RESIZE_NW"
      : isNorth && isEast
      ? "RESIZE_NE"
      : isNorth
      ? "RESIZE_N"
      : isSouth && isWest
      ? "RESIZE_SW"
      : isSouth && isEast
      ? "RESIZE_SE"
      : isSouth
      ? "RESIZE_S"
      : isWest
      ? "RESIZE_W"
      : isEast
      ? "RESIZE_E"
      : null;
  }

  getCursor(worldPoint: Point, scale: number): string {
    if (!this.isSelected()) return "pointer";

    const resizeRegion = this.getResizeRegion(worldPoint, scale);

    if (!resizeRegion) {
      return this.moveStartPoint ? "grabbing" : "grab";
    }

    switch (resizeRegion) {
      case "RESIZE_N":
      case "RESIZE_S":
        return "ns-resize";
      case "RESIZE_E":
      case "RESIZE_W":
        return "ew-resize";
      case "RESIZE_NE":
      case "RESIZE_SW":
        return "nesw-resize";
      case "RESIZE_NW":
      case "RESIZE_SE":
        return "nwse-resize";
      default:
        return "grab";
    }
  }

  // Interaction handlers
  onPointerDown(
    point: Point,
    worldPoint: Point,
    _event: PointerEvent,
    scale: number
  ): boolean {
    const resizeRegion = this.getResizeRegion(worldPoint, scale);
    const cursorRegion = resizeRegion || "DRAGGING";

    if (cursorRegion === "DRAGGING" && !this.isDraggable) return false;
    if (cursorRegion.startsWith("RESIZE_") && !this.isResizeable) return false;

    // Store move start information
    this.moveStartPoint = point;
    this.moveStartPosition = this.getPosition();
    this.moveStartBounds = { ...this.absoluteBounds };

    return true;
  }

  onMove(
    point: Point,
    worldPoint: Point,
    event: PointerEvent,
    scale: number
  ): boolean {
    this.calculateMoving(point, worldPoint, scale);

    if (this.moveState === "DRAGGING") {
      return this.onDrag(point, event, scale);
    } else if (this.moveState.startsWith("RESIZE_")) {
      return this.onResize(point, event, scale);
    } else {
      return false;
    }
  }

  private onDrag(point: Point, _event: PointerEvent, scale: number): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const delta = {
      x: (point.x - this.moveStartPoint.x) / scale,
      y: (point.y - this.moveStartPoint.y) / scale,
    };

    // Update absolute bounds
    this.absoluteBounds = {
      x: this.moveStartBounds.x + delta.x,
      y: this.moveStartBounds.y + delta.y,
      width: this.moveStartBounds.width,
      height: this.moveStartBounds.height,
    };

    this.markDirty();

    return true;
  }

  private onResize(point: Point, _event: PointerEvent, scale: number): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const delta = {
      x: (point.x - this.moveStartPoint.x) / scale,
      y: (point.y - this.moveStartPoint.y) / scale,
    };

    let { x, y, width, height } = this.moveStartBounds;

    if (["RESIZE_NW", "RESIZE_N", "RESIZE_NE"].includes(this.moveState)) {
      y += delta.y;
      height -= delta.y;
    }

    if (["RESIZE_NW", "RESIZE_W", "RESIZE_SW"].includes(this.moveState)) {
      x += delta.x;
      width -= delta.x;
    }

    if (["RESIZE_SW", "RESIZE_S", "RESIZE_SE"].includes(this.moveState)) {
      height += delta.y;
    }

    if (["RESIZE_NE", "RESIZE_E", "RESIZE_SE"].includes(this.moveState)) {
      width += delta.x;
    }

    // Update absolute bounds
    this.absoluteBounds = {
      x,
      y,
      width,
      height,
    };

    this.markDirty();

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    // Mark final position for relative-coordinate update and reset drag state
    this.markForCoordinateUpdate();
    this.moveState = "NONE";
    this.moveStartPoint = undefined;
    this.moveStartPosition = undefined;
    this.moveStartBounds = undefined;

    return true;
  }

  /**
   * Gets the bounding box bounds (absolute).
   * @returns The bounds of the bounding box.
   */
  getBounds(): Rect {
    return this.getAbsoluteBounds();
  }

  /**
   * Gets the current bounds of the bounding box (implements BoundedOverlay).
   * @returns The current bounds of the bounding box.
   */
  getCurrentBounds(): Rect | undefined {
    return this.getAbsoluteBounds();
  }

  /**
   * Forces the overlay to recalculate and update its current bounds (implements BoundedOverlay).
   * For bounding boxes, this marks it for coordinate update.
   */
  forceUpdateBounds(): void {
    this.markForCoordinateUpdate();
  }

  /**
   * Sets the bounding box bounds (absolute).
   * @param bounds - The new bounds.
   */
  setBounds(bounds: Rect): void {
    this.absoluteBounds = { ...bounds };
    this.markForCoordinateUpdate();
  }

  /**
   * Gets the label text.
   * @returns The label text, if any.
   */
  getLabel(): string | undefined {
    return this.options.label.label;
  }

  /**
   * Gets the confidence score.
   * @returns The confidence score, if any.
   */
  getConfidence(): number | undefined {
    return this.options.label?.confidence;
  }

  /**
   * Sets whether this overlay can be dragged.
   * @param draggable - Whether the overlay should be draggable.
   */
  setDraggable(draggable: boolean): void {
    this.isDraggable = draggable;
  }

  /**
   * Gets whether this overlay is draggable.
   * @returns True if the overlay is draggable.
   */
  getDraggable(): boolean {
    return this.isDraggable;
  }

  /**
   * Sets whether this overlay can be resized.
   * @param resizeable - Whether the overlay should be resizeable.
   */
  setResizeable(resizeable: boolean): void {
    this.isResizeable = resizeable;
  }

  /**
   * Gets whether this overlay is resizeable.
   * @returns True if the overlay is resizeable.
   */
  getResizeable(): boolean {
    return this.isResizeable;
  }

  /**
   * Gets the containment level for ordering purposes.
   * @param point - The point to test.
   * @returns The containment level (NONE = 0, CONTENT = 1, BORDER = 2).
   */
  getContainmentLevel(point: Point): CONTAINS {
    const drawnBounds = this.getDrawnBBox();

    // Check if point is inside the main bounding box
    if (this.isPointInRect(point, drawnBounds)) {
      return CONTAINS.CONTENT;
    }

    // Check if point is in the label text area (header)
    if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
      return CONTAINS.BORDER;
    }

    return CONTAINS.NONE;
  }

  /**
   * Gets the distance from this overlay to a mouse point.
   * @param point - The mouse point.
   * @returns The distance to the point.
   */
  getMouseDistance(point: Point): number {
    // If point is in header, return 0 (highest priority)
    if (this.textBounds && this.isPointInRect(point, this.textBounds)) {
      return 0;
    }

    // Get the drawn bounding box
    const drawnBounds = this.getDrawnBBox();

    // Calculate distance to each edge of the bounding box
    const distances = [
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x, y: drawnBounds.y },
        { x: drawnBounds.x + drawnBounds.width, y: drawnBounds.y }
      ),
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x + drawnBounds.width, y: drawnBounds.y },
        {
          x: drawnBounds.x + drawnBounds.width,
          y: drawnBounds.y + drawnBounds.height,
        }
      ),
      distanceFromLineSegment(
        point,
        {
          x: drawnBounds.x + drawnBounds.width,
          y: drawnBounds.y + drawnBounds.height,
        },
        { x: drawnBounds.x, y: drawnBounds.y + drawnBounds.height }
      ),
      distanceFromLineSegment(
        point,
        { x: drawnBounds.x, y: drawnBounds.y + drawnBounds.height },
        { x: drawnBounds.x, y: drawnBounds.y }
      ),
    ];

    return Math.min(...distances);
  }

  /**
   * Gets the drawn bounding box, accounting for stroke width.
   * Similar to looker's getDrawnBBox method.
   * @returns The drawn bounding box with stroke width expansion.
   */
  private getDrawnBBox(): Rect {
    const bounds = this.absoluteBounds;
    const strokeWidth = this.getCurrentStyle()?.lineWidth ?? STROKE_WIDTH;

    return {
      x: bounds.x - strokeWidth,
      y: bounds.y - strokeWidth,
      width: bounds.width + strokeWidth * 2,
      height: bounds.height + strokeWidth * 2,
    };
  }

  /**
   * Checks if a point is inside a rectangle.
   * @param point - The point to test.
   * @param rect - The rectangle to test against.
   * @returns True if the point is inside the rectangle.
   */
  private isPointInRect(point: Point, rect: Rect): boolean {
    return (
      point.x >= rect.x &&
      point.y >= rect.y &&
      point.x <= rect.x + rect.width &&
      point.y <= rect.y + rect.height
    );
  }

  // Selectable interface implementation
  isSelected(): boolean {
    return this.isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.isSelectedState !== selected) {
      this.isSelectedState = selected;
      this.markDirty();
    }
  }

  toggleSelected(): boolean {
    this.setSelected(!this.isSelectedState);
    return this.isSelectedState;
  }

  getSelectionPriority(): number {
    return LABEL_ARCHETYPE_PRIORITY.BOUNDING_BOX;
  }

  // Hoverable interface implementation
  onHoverEnter(_point: Point, _event: PointerEvent): boolean {
    this.isHoveredState = true;
    this.markDirty();
    return true;
  }

  onHoverLeave(_point: Point, _event: PointerEvent): boolean {
    this.isHoveredState = false;
    this.markDirty();
    return true;
  }

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null {
    return {
      color: "#ff6b6b", // This should come from the overlay's style (owned by Scene2D)
      field: this.field || "unknown",
      label: this.label,
      type: "Detection",
    };
  }
}
