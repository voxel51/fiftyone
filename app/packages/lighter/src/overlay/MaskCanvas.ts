/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SegmentationToolState } from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, Point, Rect } from "../types";
import { createMaskCanvas, decodeMask, maskBounds } from "../utils";

/**
 * Manages mask decoding, rendering, and interactive painting for a
 * detection overlay. Owns the decoded bitmap, the mutable editing canvas,
 * and all painting helpers.
 */
export class MaskCanvas {
  /** Cached decoded mask bitmap, keyed by the raw mask string to detect changes. */
  private maskBitmap?: ImageBitmap;

  // ---- Editing canvas state ----
  private canvas?: HTMLCanvasElement;
  private context?: CanvasRenderingContext2D;
  private lastPoint?: Point;

  constructor(maskData?: string, color = "#FFFFFF") {
    console.log("[MaskCanvas]", { maskData, color });
    if (maskData && typeof maskData === "string") {
      decodeMask(maskData, color)
        .then((bitmap) => {
          this.maskBitmap = bitmap;
          console.log("[MaskCanvas] maskBitmap");
        })
        .catch((err) => {
          console.error("[MaskCanvas] mask decode failed:", err);
        });
    } else {
      console.log("[MaskCanvas] like a virgin");
    }
  }

  /**
   * Returns true if a mask is available for rendering (editing canvas or decoded bitmap).
   */
  hasRenderable(): boolean {
    return this.canvas != null || this.maskBitmap != null;
  }

  /**
   * Draws the mask within the given bounds.
   * Prefers the mutable editing canvas over the decoded bitmap.
   */
  draw(renderer: Renderer2D, bounds: Rect, containerId: string): void {
    console.log("[MaskCanvas][draw]");
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
  ensureCanvas(bounds: Rect): void {
    console.log("[MaskCanvas][ensureCanvas]");
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
   * Returns the current mask editing canvas, if any.
   */
  getCanvas(): HTMLCanvasElement | undefined {
    return this.canvas;
  }

  /**
   * Clears the mask editing canvas contents.
   */
  clearCanvas(): void {
    if (this.context && this.canvas) {
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  // ---------------------------------------------------------------------------
  // Painting
  // ---------------------------------------------------------------------------

  /**
   * Converts a world-space point to mask-pixel coordinates.
   */
  worldToMask(worldPoint: Point, bounds: Rect): Point | undefined {
    console.log("[MaskCanvas][worldToMask]");
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
    console.log("[MaskCanvas][paint]");

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
    point: Point,
    worldPoint: Point,
    bounds: Rect,
    toolState: SegmentationToolState,
    style: DrawStyle | undefined
  ): Rect | undefined {
    console.log("[MaskCanvas][paintAt]");
    this.ensureCanvas(bounds);

    const updatedBounds = this.updateBounds(worldPoint, bounds, toolState);
    console.log("[MaskCanvas][paintAt]", updatedBounds);
    const maskPoint = this.worldToMask(worldPoint, bounds);

    if (maskPoint) {
      console.log("[MaskCanvas][paintAt]", maskPoint);
      const lastPoint = this.lastPoint;
      this.lastPoint = maskPoint;

      if (lastPoint) {
        // TODO...
        this.paint(maskPoint, toolState, style);
      } else {
        this.paint(maskPoint, toolState, style);
      }
    }

    return updatedBounds;
  }

  paintEnd() {
    this.lastPoint = undefined;
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
      this.paintAt({ x: from.x + dx * t, y: from.y + dy * t }, tool, style);
    }
  }

  /**
   * Stores the last painted point for line interpolation.
   */
  setLastPoint(point: Point | undefined): void {
    this.lastPoint = point;
  }

  getLastPoint(): Point | undefined {
    return this.lastPoint;
  }

  // ---------------------------------------------------------------------------
  // Bounds recomputation
  // ---------------------------------------------------------------------------

  // TODO: jsdoc
  getBounds() {
    console.log("[MaskCanvas][getBounds]");
    if (!this.canvas || !this.context)
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    const { width, height } = this.canvas;
    return maskBounds(this.context?.getImageData(0, 0, width, height));
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
  updateBounds(
    worldPoint: Point,
    oldBounds: Rect,
    toolState: SegmentationToolState | undefined
  ): Rect | undefined {
    console.log("[MaskCanvas][updateBounds]");
    if (!this.canvas || !this.context) return oldBounds;

    const { width, height } = this.canvas;

    const {
      minX: pxMinX,
      minY: pxMinY,
      maxX: pxMaxX,
      maxY: pxMaxY,
    } = this.getBounds();
    console.log("getBounds", {
      pxMinX,
      pxMinY,
      pxMaxX,
      pxMaxY,
    });

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
    console.log("worldMax", {
      worldMinX,
      worldMinY,
      worldMaxX,
      worldMaxY,
    });

    // For brush, include the dab extent
    if (toolState?.tool === "brush") {
      const half = (toolState.size ?? 0) / 2;
      worldMinX = Math.min(worldMinX, worldPoint.x - half);
      worldMinY = Math.min(worldMinY, worldPoint.y - half);
      worldMaxX = Math.max(worldMaxX, worldPoint.x + half);
      worldMaxY = Math.max(worldMaxY, worldPoint.y + half);
    }

    console.log("worldMax", {
      worldMinX,
      worldMinY,
      worldMaxX,
      worldMaxY,
    });

    // No content and no dab — signal to clear
    if (worldMaxX <= worldMinX || worldMaxY <= worldMinY) {
      console.log("ABORT");
      this.canvas = undefined;
      this.context = undefined;
      return undefined;
    }

    const newWidth = Math.max(1, Math.round(worldMaxX - worldMinX));
    const newHeight = Math.max(1, Math.round(worldMaxY - worldMinY));

    // Skip resize if bounds haven't changed
    if (
      newWidth === width &&
      newHeight === height &&
      Math.abs(worldMinX - oldBounds.x) < 1e-6 &&
      Math.abs(worldMinY - oldBounds.y) < 1e-6
    ) {
      console.log("OLD BOUNDS");
      return oldBounds;
    }

    // Allocate new canvas and copy over old pixels
    const offsetX = hasContent ? Math.round(oldBounds.x - worldMinX) : 0;
    const offsetY = hasContent ? Math.round(oldBounds.y - worldMinY) : 0;
    this.updateCanvas(newWidth, newHeight, offsetX, offsetY);

    console.log({
      x: worldMinX,
      y: worldMinY,
      width: newWidth,
      height: newHeight,
    });
    return {
      x: worldMinX,
      y: worldMinY,
      width: newWidth,
      height: newHeight,
    };
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    console.log("[MaskCanvas][destroy]");
    this.maskBitmap?.close();
    this.maskBitmap = undefined;
    this.canvas = undefined;
    this.context = undefined;
    this.lastPoint = undefined;
  }
}
