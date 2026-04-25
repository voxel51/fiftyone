/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SegmentationToolState } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, Point, Rect } from "../types";
import { parseColorWithAlpha } from "../utils/color";
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
  private currentColor?: string;
  private lastColor?: string;

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
    this.currentColor = color;
    this.decodeMaskIfNeeded(color, onDecoded);

    if (!this.hasRenderable()) return;

    if (this.canvas) {
      // When the overlay color first becomes available or changes, rebuild the
      // canvas so every pixel is recolored and alpha-thresholded in one pass.
      if (this.currentColor !== this.lastColor) {
        this.updateCanvas(this.canvas.width, this.canvas.height);
      }

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

  /**
   * Returns the current mask as a drawable source for sidebar preview.
   * Prefers the editing canvas (most up-to-date), falls back to decoded bitmap.
   */
  getPreviewSource(): HTMLCanvasElement | ImageBitmap | undefined {
    return this.canvas ?? this.maskBitmap;
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
        style?.strokeStyle ||
        style?.fillStyle ||
        this.currentColor ||
        "#ffffff";
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

    // Compute dab extent: brush expands bounds, eraser does not
    let minX = bounds.x;
    let minY = bounds.y;
    let maxX = bounds.x + bounds.width;
    let maxY = bounds.y + bounds.height;

    if (toolState.tool === "brush") {
      const half = (toolState.size ?? 0) / 2;
      minX = Math.min(minX, worldPoint.x - half);
      minY = Math.min(minY, worldPoint.y - half);
      maxX = Math.max(maxX, worldPoint.x + half);
      maxY = Math.max(maxY, worldPoint.y + half);
    }

    const updatedBounds = this.updateBounds(bounds, { minX, minY, maxX, maxY });
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

    // Compute polygon extent: non-eraser expands to contain all points
    let minX = bounds.x;
    let minY = bounds.y;
    let maxX = bounds.x + bounds.width;
    let maxY = bounds.y + bounds.height;

    if (toolState.tool !== "eraser") {
      for (const wp of worldPoints) {
        minX = Math.min(minX, wp.x);
        minY = Math.min(minY, wp.y);
        maxX = Math.max(maxX, wp.x);
        maxY = Math.max(maxY, wp.y);
      }
    }

    const updatedBounds = this.updateBounds(bounds, { minX, minY, maxX, maxY });
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
        style?.strokeStyle ||
        style?.fillStyle ||
        this.currentColor ||
        "#ffffff";
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

  paintEnd(bounds: Rect, onEncoded?: () => void) {
    if (!this.canvas) return;

    this.lastPoint = undefined;

    // Rebuild the canvas to recolor + threshold anti-aliased edge pixels
    // before the snapshot and encode.
    this.updateCanvas(this.canvas.width, this.canvas.height);

    this.postStrokeBounds = { ...bounds };
    this.postStrokeSnapshot = this.takeSnapshot();

    encodeMask(this.canvas).then((encoded) => {
      this.pendingMask = encoded;
      onEncoded?.();
    });
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

  /**
   * Allocates a new canvas, copies existing pixels into it, and recolors
   * every non-transparent pixel to {@link currentColor} while snapping alpha
   * to 0 or 255.  This serves double duty:
   *
   * 1. Resizing the canvas when the mask bounds expand during painting.
   * 2. Correcting wrong-colored pixels and eliminating anti-aliased edges
   *    produced by Canvas 2D path drawing (arc/fill always anti-alias).
   */
  private updateCanvas(
    width: number,
    height: number,
    offsetX = 0,
    offsetY = 0
  ) {
    const { maskCanvas, maskContext } = createMaskCanvas(width, height);

    if (this.canvas && this.context) {
      const { width, height } = this.canvas;
      const imageData = this.context.getImageData(0, 0, width, height);

      // Recolor + threshold: snap every non-transparent pixel to the
      // overlay color with full alpha, eliminating anti-aliased fringes
      // and correcting any pixels painted before the color was known.
      if (this.currentColor) {
        const { color: hex } = parseColorWithAlpha(this.currentColor);
        const r = (hex >> 16) & 0xff;
        const g = (hex >> 8) & 0xff;
        const b = hex & 0xff;
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3] > 0) {
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = 255;
          }
        }

        this.lastColor = this.currentColor;
      }

      maskContext.putImageData(imageData, offsetX, offsetY);
    }

    this.canvas = maskCanvas;
    this.context = maskContext;
  }

  /**
   * Clamps the caller-supplied extent against preStrokeBounds, resizes the
   * canvas to fit, and returns the new world-space bounds.
   *
   * Each caller is responsible for computing its own extent (e.g. dab extent
   * for paintAt, polygon extent for fillPolygon) before calling this method.
   */
  private updateBounds(
    oldBounds: Rect,
    extent: { minX: number; minY: number; maxX: number; maxY: number }
  ): Rect | undefined {
    if (!this.canvas || !this.context) return undefined;

    const origMaxX = this.preStrokeBounds!.x + this.preStrokeBounds!.width;
    const origMaxY = this.preStrokeBounds!.y + this.preStrokeBounds!.height;

    const minX = Math.floor(Math.min(this.preStrokeBounds!.x, extent.minX));
    const minY = Math.floor(Math.min(this.preStrokeBounds!.y, extent.minY));
    const maxX = Math.max(origMaxX, extent.maxX);
    const maxY = Math.max(origMaxY, extent.maxY);

    const newWidth = Math.max(1, Math.ceil(maxX - minX));
    const newHeight = Math.max(1, Math.ceil(maxY - minY));

    // offset to place old mask in new canvas
    const offsetX = Math.round(oldBounds.x - minX);
    const offsetY = Math.round(oldBounds.y - minY);

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
