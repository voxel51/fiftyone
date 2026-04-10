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

  // Running total of pixel offset applied since stroke start.
  // Avoids per-frame rounding drift.
  private appliedOffsetX = 0;
  private appliedOffsetY = 0;

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
  draw(
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
   * When seeding from a decoded bitmap, uses the bitmap dimensions.
   * Otherwise derives canvas size from the given absolute bounds (1:1 mapping).
   */
  private ensureCanvas(bounds: Rect): void {
    if (this.canvas) return;

    const width = this.maskBitmap
      ? this.maskBitmap.width
      : Math.max(1, Math.round(bounds.width));

    const height = this.maskBitmap
      ? this.maskBitmap.height
      : Math.max(1, Math.round(bounds.height));

    const { maskCanvas, maskContext } = createMaskCanvas(width, height);

    this.canvas = maskCanvas;
    this.context = maskContext;

    if (this.maskBitmap) {
      this.context.drawImage(this.maskBitmap, 0, 0);
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
    this.appliedOffsetX = 0;
    this.appliedOffsetY = 0;
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

    const { width, height } = this.canvas;

    const {
      minX: pxMinX,
      minY: pxMinY,
      maxX: pxMaxX,
      maxY: pxMaxY,
    } = this.getBounds();

    // Convert pixel content bounds to world space
    let worldMinX: number;
    let worldMinY: number;
    let worldMaxX: number;
    let worldMaxY: number;

    const hasContent = pxMaxX > 0 || pxMaxY > 0;

    if (hasContent) {
      worldMinX = oldBounds.x + (pxMinX / width) * oldBounds.width;
      worldMinY = oldBounds.y + (pxMinY / height) * oldBounds.height;
      worldMaxX = oldBounds.x + ((pxMaxX + 1) / width) * oldBounds.width;
      worldMaxY = oldBounds.y + ((pxMaxY + 1) / height) * oldBounds.height;
    } else {
      worldMinX = Infinity;
      worldMinY = Infinity;
      worldMaxX = -Infinity;
      worldMaxY = -Infinity;
    }

    // For brush, include the dab extent
    if (toolState?.tool === "brush") {
      const half = (toolState.size ?? 0) / 2;
      worldMinX = Math.min(worldMinX, worldPoint.x - half);
      worldMinY = Math.min(worldMinY, worldPoint.y - half);
      worldMaxX = Math.max(worldMaxX, worldPoint.x + half);
      worldMaxY = Math.max(worldMaxY, worldPoint.y + half);
    }

    // No content and no dab — signal to clear
    if (worldMaxX <= worldMinX || worldMaxY <= worldMinY) {
      this.canvas = undefined;
      this.context = undefined;
      return undefined;
    }

    // Anchor the bottom-right to the pre-stroke edge so it never drifts.
    // Only the top-left can move (when painting up/left).
    const ref = this.preStrokeBounds ?? oldBounds;
    const refRight = ref.x + ref.width;
    const refBottom = ref.y + ref.height;
    const refW = this.preStrokeSnapshot?.width ?? width;
    const refH = this.preStrokeSnapshot?.height ?? height;

    // The bottom-right is the max of the pre-stroke edge and the new content edge.
    // The top-left is the min of the pre-stroke origin and the new content origin.
    const anchoredMaxX = Math.max(refRight, worldMaxX);
    const anchoredMaxY = Math.max(refBottom, worldMaxY);

    // Floor the min so it always snaps to an integer boundary. This means
    // the offset (oldBounds.x - anchoredMinX) is always exact when
    // oldBounds.x was itself a floored value from the previous frame.
    const anchoredMinX = Math.floor(Math.min(ref.x, worldMinX));
    const anchoredMinY = Math.floor(Math.min(ref.y, worldMinY));

    const newWidth = Math.max(1, Math.ceil(anchoredMaxX - anchoredMinX));
    const newHeight = Math.max(1, Math.ceil(anchoredMaxY - anchoredMinY));

    // Old canvas origin relative to new canvas origin. Both are integers
    // (previous anchoredMin was floored, current anchoredMin is floored),
    // so this is exact — no rounding needed.
    const offsetX = hasContent ? Math.round(oldBounds.x - anchoredMinX) : 0;
    const offsetY = hasContent ? Math.round(oldBounds.y - anchoredMinY) : 0;

    // Skip resize if nothing changed
    if (
      newWidth === width &&
      newHeight === height &&
      offsetX === 0 &&
      offsetY === 0
    ) {
      return oldBounds;
    }

    this.updateCanvas(newWidth, newHeight, offsetX, offsetY);

    return {
      x: anchoredMinX,
      y: anchoredMinY,
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
