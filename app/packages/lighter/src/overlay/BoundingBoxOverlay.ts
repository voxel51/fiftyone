/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  EDGE_THRESHOLD,
  HANDLE_OFFSET_X,
  HANDLE_OFFSET_Y,
  HOVERED_DASH_LENGTH,
  LABEL_ARCHETYPE_PRIORITY,
  SELECTED_DASH_LENGTH,
  STROKE_WIDTH,
} from "../constants";
import { CONTAINS } from "../core/Scene2D";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type {
  Hoverable,
  Point,
  RawLookerLabel,
  Rect,
  RenderMeta,
  Spatial,
} from "../types";
import { parseColorWithAlpha } from "../utils/color";
import {
  getInstanceStrokeStyles,
  getSimpleStrokeStyles,
} from "../utils/colorMapping";
import { distanceFromLineSegment } from "../utils/geometry";
import { BaseOverlay } from "./BaseOverlay";
import { SerializedMask } from "@fiftyone/utilities";
import { BASE_ALPHA } from "@fiftyone/looker/src/constants";
import { deserialize } from "@fiftyone/looker/src/numpy";

export type BoundingBoxLabel = RawLookerLabel & {
  label: string;
  bounding_box: number[];
  confidence?: number;
  mask?: SerializedMask;
};

/**
 * Options for creating a bounding box overlay.
 */
export interface BoundingBoxOptions {
  id: string;
  // Relative bounds [0,1]
  relativeBounds?: Rect;
  label: BoundingBoxLabel;
  field: string;
  draggable?: boolean;
  resizeable?: boolean;
  selectable?: boolean;
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

export type MoveState = ResizeRegion | "NONE" | "DRAGGING" | "SETTING";

export const NO_BOUNDS = { x: NaN, y: NaN, width: NaN, height: NaN };

/**
 * Bounding box overlay implementation with drag support, selection, and spatial coordinates.
 */
export class BoundingBoxOverlay
  extends BaseOverlay<BoundingBoxLabel>
  implements Selectable, Spatial, Hoverable
{
  private isDraggable: boolean;
  private isResizeable: boolean;
  private moveState: MoveState = "NONE";
  private moveStartPoint?: Point;
  private moveStartPosition?: Point;
  private moveStartBounds?: Rect;
  private isSelectedState = false;

  #relativeBounds: Rect;

  private textBounds?: Rect;

  private maskBitmap?: ImageBitmap;
  private maskData?: { src: Uint8Array; width: number; height: number };
  private maskDecoding = false;
  private lastMaskSource?: string;

  public cursor = "pointer";

  constructor(options: BoundingBoxOptions) {
    super(options.id, options.field, options.label);
    this.isDraggable = options.draggable !== false;
    this.isResizeable = options.resizeable !== false;

    this.#relativeBounds = options.relativeBounds || NO_BOUNDS;
  }

  getOverlayType(): string {
    return "BoundingBoxOverlay";
  }

  updateLabel(label: BoundingBoxLabel) {
    super.updateLabel(label);

    if (label.bounding_box) {
      const [x, y, w, h] = label.bounding_box;
      this.#relativeBounds = { x, y, width: w, height: h };
      this.markDirty();
      this.eventBus.dispatch("lighter:overlay-bounds-changed", {
        id: this.id,
        bounds: this.bounds,
      });
    }

    // invalidate cached mask with new label data
    const newMaskSource = this.extractMaskB64(label.mask);
    if (newMaskSource !== this.lastMaskSource) {
      this.maskBitmap?.close();
      this.maskBitmap = undefined;
      this.maskData = undefined;
      this.lastMaskSource = undefined;
      this.markDirty();
    }
  }

  getPosition() {
    const { x, y } = this.bounds;
    return {
      x,
      y,
    };
  }

  get bounds(): Rect {
    const bounds = this.relativeBounds;
    return this.getCoordinateSystem().relativeToAbsolute(bounds);
  }

  set bounds(bounds: Rect | undefined) {
    this.markDirty();
    if (!bounds) {
      this.#relativeBounds = NO_BOUNDS;
      return;
    }

    const relative = this.getCoordinateSystem().absoluteToRelative(bounds);
    this.#relativeBounds = relative;
    this.eventBus.dispatch("lighter:overlay-bounds-changed", {
      id: this.id,
      bounds: this.bounds,
    });
  }

  get relativeBounds(): Rect {
    return this.#relativeBounds;
  }

  set relativeBounds(bounds: Rect | undefined) {
    this.#relativeBounds = bounds ? { ...bounds } : NO_BOUNDS;
    this.markDirty();
  }

  get containerId() {
    return this.id;
  }

  protected renderImpl(renderer: Renderer2D, _renderMeta: RenderMeta): void {
    // Dispose of old elements before creating new ones
    renderer.dispose(this.containerId);

    const style = this.currentStyle;

    if (!style) return;

    // Draw the segmentation mask beneath the box outline when available.
    if (this.maskBitmap) {
      renderer.drawImage(
        { type: "bitmap", bitmap: this.maskBitmap },
        this.bounds,
        { opacity: style.opacity ?? BASE_ALPHA },
        this.containerId
      );
    } else if (this.label?.mask && !this.maskDecoding) {
      this.decodeMask();
    }

    // Check if this label has an instance to determine stroke styling
    const hasInstance = this.label?.instance?._id !== undefined;

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
            dashLength: this.isSelectedState
              ? SELECTED_DASH_LENGTH
              : HOVERED_DASH_LENGTH,
          });

    const mainStrokeStyle = {
      ...style,
      strokeStyle: strokeColor,
      isSelected: this.isSelectedState,
    };

    delete mainStrokeStyle.dashPattern;

    renderer.drawRect(this.bounds, mainStrokeStyle, this.containerId);

    if (hoverStrokeColor) {
      renderer.drawRect(
        this.bounds,
        {
          strokeStyle: hoverStrokeColor,
          lineWidth: style.lineWidth || STROKE_WIDTH,
        },
        this.containerId
      );
    } else if (overlayStrokeColor && overlayDash) {
      renderer.drawRect(
        this.bounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: style.lineWidth,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId
      );
    }

    if (
      this.isSelected() &&
      style.strokeStyle &&
      (this.isDraggable || this.isResizeable)
    ) {
      const colorObj = parseColorWithAlpha(style.strokeStyle);
      const color = colorObj.color;
      renderer.drawScrim(
        this.bounds,
        _renderMeta.canonicalMediaBounds,
        this.containerId
      );
      renderer.drawHandles(
        this.bounds,
        style.lineWidth || STROKE_WIDTH,
        color,
        this.containerId
      );
    }

    if (this.label && this.label.label?.length > 0) {
      const offset = style.lineWidth
        ? style.lineWidth / renderer.getScale() / 2
        : 0;

      const labelPosition = this.isSelected()
        ? {
            x: this.bounds.x + offset * HANDLE_OFFSET_X,
            y: this.bounds.y - offset * HANDLE_OFFSET_Y,
          }
        : {
            x: this.bounds.x - offset,
            y: this.bounds.y - offset,
          };

      let textToDraw = this.label?.label;

      if (
        typeof this.label?.confidence !== "undefined" &&
        !isNaN(this.label?.confidence)
      ) {
        textToDraw += ` (${this.label?.confidence.toFixed(2)})`;
      }

      // Draw text and store the dimensions for accurate header detection
      this.textBounds = renderer.drawText(
        textToDraw,
        labelPosition,
        {
          fontColor: "#ffffff",
          backgroundColor: style.fillStyle || style.strokeStyle || "#000",
        },
        this.containerId
      );
    }

    this.emitLoaded();
  }

  getMoveStartPosition(): Point | undefined {
    return this.moveStartPosition;
  }

  getMoveStartBounds(): Rect | undefined {
    return this.moveStartBounds;
  }

  getMoveState() {
    return this.moveState;
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

  isSetting() {
    return this.moveState === "SETTING";
  }

  private getResizeRegion(
    worldPoint: Point,
    scale: number
  ): ResizeRegion | null {
    const { x, y, height, width } = this.bounds;

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
    if (!this.hasValidBounds()) return "crosshair";
    if (!this.isSelected()) return "pointer";

    if (!this.isDraggable && !this.isResizeable) {
      return "default";
    }

    const resizeRegion = this.getResizeRegion(worldPoint, scale);

    if (!resizeRegion) {
      return this.isDraggable
        ? this.moveStartPoint
          ? "grabbing"
          : "grab"
        : "default";
    }

    if (!this.isResizeable) {
      return "default";
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
    const cursorState = !this.hasValidBounds()
      ? "SETTING"
      : resizeRegion || "DRAGGING";

    if (cursorState === "DRAGGING" && !this.isDraggable) return false;
    if (cursorState.startsWith("RESIZE_") && !this.isResizeable) return false;

    if (cursorState === "DRAGGING" || cursorState.startsWith("RESIZE_")) {
      this.renderer?.disableZoomPan();
    }

    this.moveState = cursorState;

    if (cursorState === "SETTING") {
      this.bounds = {
        ...worldPoint,
        height: 0,
        width: 0,
      };
    }

    // Store move start information
    this.moveStartPoint = point;
    this.moveStartPosition = {
      x: this.bounds.x,
      y: this.bounds.y,
    };
    this.moveStartBounds = { ...this.bounds };

    return true;
  }

  onMove(
    point: Point,
    worldPoint: Point,
    event: PointerEvent,
    scale: number,
    maintainAspectRatio?: boolean
  ): boolean {
    if (this.moveState === "DRAGGING") {
      return this.onDrag(point, event, scale);
    }

    if (this.moveState === "SETTING" || this.moveState.startsWith("RESIZE_")) {
      return this.onResize(point, event, scale, maintainAspectRatio);
    }

    return false;
  }

  private onDrag(point: Point, _event: PointerEvent, scale: number): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const delta = {
      x: (point.x - this.moveStartPoint.x) / scale,
      y: (point.y - this.moveStartPoint.y) / scale,
    };

    // Update absolute bounds
    this.bounds = {
      x: this.moveStartBounds.x + delta.x,
      y: this.moveStartBounds.y + delta.y,
      width: this.moveStartBounds.width,
      height: this.moveStartBounds.height,
    };

    return true;
  }

  private onResize(
    point: Point,
    _event: PointerEvent,
    scale: number,
    maintainAspectRatio = false
  ): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    const delta = {
      x: (point.x - this.moveStartPoint.x) / scale,
      y: (point.y - this.moveStartPoint.y) / scale,
    };

    let maintainX = 0;
    let maintainY = 0;

    if (maintainAspectRatio) {
      const aspectRatio =
        this.moveStartBounds.width && this.moveStartBounds.height
          ? this.moveStartBounds.width / this.moveStartBounds.height
          : 1;

      if (
        Math.abs(delta.x / this.bounds.width) >
        Math.abs(delta.y / this.bounds.height)
      ) {
        maintainY = delta.x / aspectRatio;
      } else {
        maintainX = delta.y * aspectRatio;
      }
    }

    let { x, y, width, height } = this.moveStartBounds;

    if (["RESIZE_NW", "RESIZE_N", "RESIZE_NE"].includes(this.moveState)) {
      maintainY = this.moveState === "RESIZE_NE" ? maintainY * -1 : maintainY;
      maintainY = this.moveState === "RESIZE_E" ? 0 : maintainY;

      y += maintainY || delta.y;
      height -= maintainY || delta.y;

      if (this.moveState === "RESIZE_N") {
        x += maintainX / 2;
        width -= maintainX;
      }
    }

    if (
      ["SETTING", "RESIZE_NW", "RESIZE_W", "RESIZE_SW"].includes(this.moveState)
    ) {
      maintainX = this.moveState === "RESIZE_SW" ? maintainX * -1 : maintainX;
      maintainX = this.moveState === "RESIZE_W" ? 0 : maintainX;

      x += maintainX || delta.x;
      width -= maintainX || delta.x;

      if (this.moveState === "RESIZE_W") {
        y += maintainY / 2;
        height -= maintainY;
      }
    }

    if (
      ["SETTING", "RESIZE_SW", "RESIZE_S", "RESIZE_SE"].includes(this.moveState)
    ) {
      maintainY = this.moveState === "RESIZE_SW" ? maintainY * -1 : maintainY;
      maintainY = this.moveState === "RESIZE_S" ? 0 : maintainY;

      height += maintainY || delta.y;

      if (this.moveState === "RESIZE_S") {
        x -= maintainX / 2;
        width += maintainX;
      }
    }

    if (["RESIZE_NE", "RESIZE_E", "RESIZE_SE"].includes(this.moveState)) {
      maintainX = this.moveState === "RESIZE_NE" ? maintainX * -1 : maintainX;
      maintainX = this.moveState === "RESIZE_E" ? 0 : maintainX;

      width += maintainX || delta.x;

      if (this.moveState === "RESIZE_E") {
        y -= maintainY / 2;
        height += maintainY;
      }
    }

    if (width < 0) {
      width *= -1;
      x -= width;
    }

    if (height < 0) {
      height *= -1;
      y -= height;
    }

    // Update absolute bounds
    this.bounds = {
      x,
      y,
      width,
      height,
    };

    return true;
  }

  onPointerUp(_point: Point, _event: PointerEvent): boolean {
    if (!this.moveStartPoint || !this.moveStartBounds) return false;

    this.moveState = "NONE";
    this.moveStartPoint = undefined;
    this.moveStartPosition = undefined;
    this.moveStartBounds = undefined;
    this.renderer?.enableZoomPan();

    return true;
  }

  /**
   * Determines if current bounds are valid.
   * @returns True if current bounds are valid
   */
  hasValidBounds(): boolean {
    return BaseOverlay.validBounds(this.bounds);
  }

  /**
   * Sets whether this overlay can be dragged.
   * @param draggable - Whether the overlay should be draggable.
   */
  setDraggable(draggable: boolean): void {
    if (this.isDraggable !== draggable) {
      this.isDraggable = draggable;
      this.markDirty();
    }
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
    if (this.isResizeable !== resizeable) {
      this.isResizeable = resizeable;
      this.markDirty();
    }
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
   * Get the  {@link CoordinateSystem} of the {@link Scene}
   * @returns {@link CoordinateSystem}
   */
  private getCoordinateSystem() {
    if (!this.coordinateSystem) {
      throw new Error("no coordinate system");
    }

    return this.coordinateSystem;
  }

  /**
   * Gets the drawn bounding box, accounting for stroke width.
   * Similar to looker's getDrawnBBox method.
   * @returns The drawn bounding box with stroke width expansion.
   */
  private getDrawnBBox(): Rect {
    const bounds = this.bounds;
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

  /**
   * Tests whether a point in relative coordinates falls on a non-zero mask
   * pixel. Returns `false` when no mask is present or the point is outside the
   * bounding box.
   */
  containsMaskPixel(relativePoint: Point): boolean {
    if (!this.maskData) {
      return false;
    }

    const rb = this.#relativeBounds;

    // Check if point is inside the bounding box
    if (
      relativePoint.x < rb.x ||
      relativePoint.y < rb.y ||
      relativePoint.x > rb.x + rb.width ||
      relativePoint.y > rb.y + rb.height
    ) {
      return false;
    }

    const { src, width, height } = this.maskData;
    const px = Math.floor(((relativePoint.x - rb.x) / rb.width) * (width - 1));
    const py = Math.floor(
      ((relativePoint.y - rb.y) / rb.height) * (height - 1)
    );

    return src[py * width + px] > 0;
  }

  private extractMaskB64(mask: SerializedMask | undefined): string | undefined {
    if (!mask) {
      return undefined;
    } else if (typeof mask === "string") {
      return mask;
    } else {
      return mask.$binary.base64;
    }
  }

  private async decodeMask(): Promise<void> {
    const b64 = this.extractMaskB64(this.label?.mask);
    if (!b64 || b64 === this.lastMaskSource) return;

    this.maskDecoding = true;
    this.lastMaskSource = b64;

    try {
      const overlayMask = deserialize(b64);
      const [height, width] = overlayMask.shape;
      const src = new Uint8Array(overlayMask.buffer);
      const rgba = new Uint8ClampedArray(width * height * 4);

      const colorObj = parseColorWithAlpha(
        this.currentStyle?.strokeStyle ?? "#ffffff"
      );
      const r = (colorObj.color >> 16) & 0xff;
      const g = (colorObj.color >> 8) & 0xff;
      const b = colorObj.color & 0xff;

      for (let i = 0; i < width * height; i++) {
        if (src[i] > 0) {
          rgba[i * 4] = r;
          rgba[i * 4 + 1] = g;
          rgba[i * 4 + 2] = b;
          rgba[i * 4 + 3] = 255;
        }
      }

      this.maskBitmap?.close();
      this.maskBitmap = await createImageBitmap(
        new ImageData(rgba, width, height)
      );
      this.maskData = { src, width, height };
      this.markDirty();
    } catch (e) {
      console.error("[BoundingBoxOverlay] Failed to decode mask:", e);
    } finally {
      this.maskDecoding = false;
    }
  }

  override destroy(): void {
    this.maskBitmap?.close();
    this.maskBitmap = undefined;
    this.maskData = undefined;
    super.destroy();
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

  getTooltipInfo(): {
    color: string;
    field: string;
    label: any;
    type: string;
  } | null {
    return {
      color: this.currentStyle?.strokeStyle ?? "#ffffff",
      field: this.field || "unknown",
      label: this.label,
      type: "Detection",
    };
  }
}
