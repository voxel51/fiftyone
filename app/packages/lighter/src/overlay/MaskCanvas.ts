/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SegmentationToolState } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, Point, Rect } from "../types";
import { createMaskCanvas, decodeMask, encodeMask, maskBounds } from "../utils";

export interface MaskSnapshot {
  imageData: ImageData;
  width: number;
  height: number;
}

export interface PaintStrokeData {
  afterBounds: Rect | undefined;
  afterSnapshot: MaskSnapshot | undefined;
  beforeBounds: Rect | undefined;
  beforeSnapshot: MaskSnapshot | undefined;
}

/**
 * Manages mask decoding, rendering, and interactive painting for a
 * detection overlay. Owns the decoded bitmap, the mutable editing canvas,
 * and all painting helpers.
 */
export class MaskCanvas {
  // Cached decoded mask bitmap, keyed by the raw mask string to detect changes.
  private maskBitmap?: ImageBitmap;
  /** Raw mask data awaiting decode (deferred until color is known). */
  private rawMaskData?: string;
  /** True while an async decode is in flight. */
  private decoding = false;
  /** The color used for the current decoded bitmap, so we can re-decode on color change. */
  private decodedColor?: string;

  // canvas contents encoded for persistence to backend
  private pendingMask?: string;

  // ---- Editing canvas state ----
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private lastPoint?: Point;

  // ---- snapshots for undo/redo ----
  private preStrokeSnapshot?: MaskSnapshot;
  private preStrokeBounds?: Rect;
  private postStrokeSnapshot?: MaskSnapshot;
  private postStrokeBounds?: Rect;

  constructor(maskData?: string) {
    if (maskData && typeof maskData === "string") {
      this.rawMaskData = maskData;
    }
  }

  /**
   * Returns true if a mask is available for rendering (editing canvas or decoded bitmap).
   */
  private hasRenderable(): boolean {
    return this.canvas != null || this.maskBitmap != null;
  }

  /**
   * Kicks off async mask decoding if raw data is present and hasn't been
   * decoded yet (or needs re-decoding due to color change).
   */
  private decodeMaskIfNeeded(color: string, onDecoded?: () => void): void {
    if (!this.rawMaskData || this.decoding) return;

    // Already decoded with this color
    if (this.maskBitmap && this.decodedColor === color) return;

    this.decoding = true;

    decodeMask(this.rawMaskData, color)
      .then((bitmap) => {
        this.maskBitmap?.close();
        this.maskBitmap = bitmap;
        this.decodedColor = color;
        this.decoding = false;
        onDecoded?.();
      })
      .catch((err) => {
        console.error("[MaskCanvas] mask decode failed:", err);
        this.decoding = false;
      });
  }

  /**
   * Draws the mask within the given bounds.
   * Prefers the mutable editing canvas over the decoded bitmap.
   * Triggers lazy decode on first call when color is known.
   */
  render(
    renderer: Renderer2D,
    bounds: Rect,
    containerId: string,
    color: string,
    onDecoded?: () => void
  ): void {
    this.decodeMaskIfNeeded(color, onDecoded);

    if (!this.hasRenderable()) return;

    if (this.canvas) {
      renderer.drawImage(
        { type: "canvas", canvas: this.canvas },
        bounds,
        { opacity: 0.7 },
        containerId
      );

      return;
    }

    if (this.maskBitmap) {
      renderer.drawImage(
        { type: "bitmap", bitmap: this.maskBitmap },
        bounds,
        { opacity: 0.7 },
        containerId
      );

      return;
    }
  }

  // ---------------------------------------------------------------------------
  // Editing canvas lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Lazily creates (or reuses) the mask editing canvas.
   * Always sizes the canvas to match the world-space bounds so that
   * canvas pixels map 1:1 with world coordinates. When seeding from a
   * decoded bitmap, the bitmap is drawn scaled to fill the canvas.
   */
  private ensureCanvas(bounds: Rect): void {
    if (this.canvas) return;

    const width = Math.max(1, Math.round(bounds.width));
    const height = Math.max(1, Math.round(bounds.height));

    const { maskCanvas, maskContext } = createMaskCanvas(width, height);

    this.canvas = maskCanvas;
    this.context = maskContext;

    if (this.maskBitmap) {
      this.context.drawImage(this.maskBitmap, 0, 0, width, height);
    }
  }

  /**
   * Clears the mask editing canvas contents.
   */
  clearCanvas(): void {
    if (this.context && this.canvas) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  getPendingMask(): string | undefined {
    const mask = this.pendingMask;
    this.pendingMask = undefined;

    return mask;
  }

  // ---------------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------------

  /**
   * Captures the canvas state and bounds before a stroke begins.
   */
  private paintStart(bounds: Rect): void {
    this.preStrokeSnapshot = this.takeSnapshot();
    this.preStrokeBounds = { ...bounds };
  }

  /**
   * Converts a world-space point to mask-pixel coordinates.
   */
  private worldToMask(worldPoint: Point, bounds: Rect): Point | undefined {
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return undefined;
    if (!this.canvas) return undefined;

    return {
      x: ((worldPoint.x - bounds.x) / bounds.width) * this.canvas.width,
      y: ((worldPoint.y - bounds.y) / bounds.height) * this.canvas.height,
    };
  }

  private paint(
    point: Point,
    toolState: SegmentationToolState,
    style: DrawStyle | undefined
  ) {
    if (!this.context) return;

    const size = toolState.size ?? 0;
    const shape = toolState.shape ?? "circle";
    const radius = size / 2;

    if (toolState.tool === "eraser") {
      this.context.globalCompositeOperation = "destination-out";
      this.context.fillStyle = "rgba(0,0,0,1)";
    } else {
      this.context.globalCompositeOperation = "source-over";
      this.context.fillStyle =
        style?.strokeStyle || style?.fillStyle || "#ffffff";
    }

    this.context.beginPath();
    if (shape === "circle") {
      this.context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    } else {
      this.context.rect(point.x - radius, point.y - radius, size, size);
    }
    this.context.fill();
  }

  /**
   * Paints a single dab at the given mask-pixel coordinate.
   */
  paintAt(
    worldPoint: Point,
    bounds: Rect,
    toolState: SegmentationToolState,
    style: DrawStyle | undefined
  ): Rect | undefined {
    this.ensureCanvas(bounds);

    if (!this.preStrokeSnapshot) {
      this.paintStart(bounds);
    }

    const updatedBounds = this.updateBounds(worldPoint, bounds, toolState);
    const maskPoint = this.worldToMask(worldPoint, updatedBounds ?? bounds);

    if (maskPoint) {
      const lastPoint = this.lastPoint;
      this.lastPoint = maskPoint;

      if (lastPoint) {
        this.paintLine(lastPoint, maskPoint, toolState, style);
      } else {
        this.paint(maskPoint, toolState, style);
      }
    }

    return updatedBounds;
  }

  /**
   * Fills a closed polygon region on the mask canvas.
   * Uses the current tool's composite operation (brush paints, eraser removes).
   */
  fillPolygon(
    worldPoints: Point[],
    bounds: Rect,
    toolState: SegmentationToolState,
    style: DrawStyle | undefined
  ): Rect | undefined {
    if (worldPoints.length < 3) return undefined;

    this.ensureCanvas(bounds);
    if (!this.context) return undefined;

    if (!this.preStrokeSnapshot) {
      this.paintStart(bounds);
    }

    // Expand bounds to contain all polygon points (paint mode only)
    let updatedBounds: Rect | undefined = { ...bounds };
    if (toolState.tool !== "eraser") {
      let minX = bounds.x;
      let minY = bounds.y;
      let maxX = bounds.x + bounds.width;
      let maxY = bounds.y + bounds.height;

      for (const wp of worldPoints) {
        minX = Math.min(minX, wp.x);
        minY = Math.min(minY, wp.y);
        maxX = Math.max(maxX, wp.x);
        maxY = Math.max(maxY, wp.y);
      }

      const origMaxX = this.preStrokeBounds!.x + this.preStrokeBounds!.width;
      const origMaxY = this.preStrokeBounds!.y + this.preStrokeBounds!.height;

      minX = Math.floor(Math.min(this.preStrokeBounds!.x, minX));
      minY = Math.floor(Math.min(this.preStrokeBounds!.y, minY));
      maxX = Math.max(origMaxX, maxX);
      maxY = Math.max(origMaxY, maxY);

      const newWidth = Math.max(1, Math.ceil(maxX - minX));
      const newHeight = Math.max(1, Math.ceil(maxY - minY));

      const offsetX = Math.round(bounds.x - minX);
      const offsetY = Math.round(bounds.y - minY);

      this.updateCanvas(newWidth, newHeight, offsetX, offsetY);

      updatedBounds = { x: minX, y: minY, width: newWidth, height: newHeight };
    }

    const activeBounds = updatedBounds ?? bounds;

    // Convert world points to mask-pixel coords
    const maskPoints = worldPoints
      .map((wp) => this.worldToMask(wp, activeBounds))
      .filter((p): p is Point => p !== undefined);

    if (maskPoints.length < 3) return undefined;

    if (toolState.tool === "eraser") {
      this.context.globalCompositeOperation = "destination-out";
      this.context.fillStyle = "rgba(0,0,0,1)";
    } else {
      this.context.globalCompositeOperation = "source-over";
      this.context.fillStyle =
        style?.strokeStyle || style?.fillStyle || "#ffffff";
    }

    this.context.beginPath();
    this.context.moveTo(maskPoints[0].x, maskPoints[0].y);
    for (let i = 1; i < maskPoints.length; i++) {
      this.context.lineTo(maskPoints[i].x, maskPoints[i].y);
    }
    this.context.closePath();
    this.context.fill();

    return updatedBounds;
  }

  paintEnd(bounds: Rect) {
    if (!this.canvas) return;

    this.lastPoint = undefined;
    this.postStrokeBounds = { ...bounds };
    this.postStrokeSnapshot = this.takeSnapshot();

    encodeMask(this.canvas).then((encoded) => (this.pendingMask = encoded));
  }

  getPaintStrokeData(): PaintStrokeData {
    const paintStrokeData = {
      afterBounds: this.postStrokeBounds,
      afterSnapshot: this.postStrokeSnapshot,
      beforeBounds: this.preStrokeBounds,
      beforeSnapshot: this.preStrokeSnapshot,
    };

    this.postStrokeBounds = undefined;
    this.postStrokeSnapshot = undefined;
    this.preStrokeBounds = undefined;
    this.preStrokeSnapshot = undefined;

    return paintStrokeData;
  }

  /**
   * Interpolates between two mask-pixel points, painting a dab at each step
   * to avoid gaps during fast mouse movement.
   */
  paintLine(
    from: Point,
    to: Point,
    tool: SegmentationToolState,
    style: DrawStyle | undefined
  ): void {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const distance = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(distance));

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.paint({ x: from.x + dx * t, y: from.y + dy * t }, tool, style);
    }
  }

  // ---------------------------------------------------------------------------
  // Bounds recomputation
  // ---------------------------------------------------------------------------

  // TODO: jsdoc
  private getBounds() {
    if (!this.canvas || !this.context)
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    const { width, height } = this.canvas;
    return maskBounds(this.context.getImageData(0, 0, width, height));
  }

  // Allocate new canvas and copy over old pixels
  private updateCanvas(
    width: number,
    height: number,
    offsetX = 0,
    offsetY = 0
  ) {
    const { maskCanvas, maskContext } = createMaskCanvas(width, height);

    if (this.canvas && this.context) {
      const { width, height } = this.canvas;
      const mask = this.context.getImageData(0, 0, width, height);
      maskContext.putImageData(mask, offsetX, offsetY);
    }

    this.canvas = maskCanvas;
    this.context = maskContext;
  }

  /**
   * Computes tight bounds around mask content and — for brush — the upcoming
   * dab, then resizes the canvas and updates bounds to match.
   *
   * Works for both tools:
   * - **Brush**: content bounding box + dab extent → may grow.
   * - **Eraser**: content bounding box only → may shrink.
   *
   * If no content remains (and no dab), returns `undefined` to signal the
   * caller should clear the detection bounds.
   */
  private updateBounds(
    worldPoint: Point,
    oldBounds: Rect,
    toolState: SegmentationToolState | undefined
  ): Rect | undefined {
    if (!this.canvas || !this.context) return oldBounds;

    const { x: oldX, y: oldY, width: oldWidth, height: oldHeight } = oldBounds;

    // upper-left and lower-right corners
    let minX = oldX;
    let minY = oldY;
    let maxX = oldX + oldWidth;
    let maxY = oldY + oldHeight;

    // For brush, include the dab extent
    // The erase tool can't expand the bounding box
    if (toolState?.tool === "brush") {
      const half = (toolState.size ?? 0) / 2;
      minX = Math.min(minX, worldPoint.x - half);
      minY = Math.min(minY, worldPoint.y - half);
      maxX = Math.max(maxX, worldPoint.x + half);
      maxY = Math.max(maxY, worldPoint.y + half);
    }

    // lower-right corner from before paint stroke
    const origMaxX = this.preStrokeBounds!.x + this.preStrokeBounds!.width;
    const origMaxY = this.preStrokeBounds!.y + this.preStrokeBounds!.height;

    minX = Math.floor(Math.min(this.preStrokeBounds!.x, minX));
    minY = Math.floor(Math.min(this.preStrokeBounds!.y, minY));
    maxX = Math.max(origMaxX, maxX);
    maxY = Math.max(origMaxY, maxY);

    const newWidth = Math.max(1, Math.ceil(maxX - minX));
    const newHeight = Math.max(1, Math.ceil(maxY - minY));

    // offset to place old mask into resized canvas
    const offsetX = Math.round(oldX - minX);
    const offsetY = Math.round(oldY - minY);

    this.updateCanvas(newWidth, newHeight, offsetX, offsetY);

    return {
      x: minX,
      y: minY,
      width: newWidth,
      height: newHeight,
    };
  }

  // ---------------------------------------------------------------------------
  // Snapshots (for undo/redo)
  // ---------------------------------------------------------------------------

  /**
   * Returns a copy of the current canvas pixel data, or `undefined` if the
   * canvas has not been created yet.
   */
  private takeSnapshot(): MaskSnapshot | undefined {
    if (!this.canvas || !this.context) return undefined;

    const { width, height } = this.canvas;
    return {
      imageData: this.context.getImageData(0, 0, width, height),
      width,
      height,
    };
  }

  /**
   * Replaces the current canvas contents with a previously captured snapshot.
   * If `snapshot` is `undefined`, clears the canvas entirely (restoring the
   * "no mask" state). Kicks off `encodeMask` so `pendingMask` stays in sync.
   */
  restoreSnapshot(snapshot: MaskSnapshot | undefined): void {
    if (!snapshot) {
      this.canvas = undefined;
      this.context = undefined;
      this.lastPoint = undefined;
      return;
    }

    const { maskCanvas, maskContext } = createMaskCanvas(
      snapshot.width,
      snapshot.height
    );
    maskContext.putImageData(snapshot.imageData, 0, 0);

    this.canvas = maskCanvas;
    this.context = maskContext;
    this.lastPoint = undefined;

    encodeMask(this.canvas).then((encoded) => (this.pendingMask = encoded));
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.maskBitmap?.close();
    this.maskBitmap = undefined;
    this.canvas = undefined;
    this.context = undefined;
    this.lastPoint = undefined;
  }
}
