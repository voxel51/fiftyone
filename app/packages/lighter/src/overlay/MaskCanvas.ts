/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import {
  SegmentationToolMode,
  SegmentationToolShape,
  type SegmentationToolState,
} from "@fiftyone/core/src/components/Modal/Sidebar/Annotate/Edit/useSegmentationMode";
import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import type { SerializedMask } from "@fiftyone/utilities";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { DrawStyle, Point, Rect } from "../types";
import {
  createMaskCanvas,
  decodeMask,
  encodeMask,
  maskBounds,
  type MaskBounds,
} from "../utils";

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
 *
 * ## Lifecycle
 *
 * The mask has two phases: display and editing. Transitioning to editing
 * (via `ensureCanvas`) is a one-way door — the display-only fields are
 * released and the canvas becomes the source of truth.
 *
 * ```
 * Display phase
 *   rawMaskData ──(decodeMask)──> maskBitmap   (color-painted, for rendering)
 *                                 rawPixels    (single-channel, for hit-testing)
 *
 * Editing phase  (ensureCanvas — copies bitmap into canvas, then releases it)
 *   canvas ──(encodeMask)──> pendingMask  (base64, for backend persistence)
 * ```
 */
export class MaskCanvas {
  // Cached decoded mask bitmap, keyed by the raw mask source to detect changes.
  private maskBitmap?: ImageBitmap;
  /**
   * Raw mask source awaiting decode (deferred until color is known). Either
   * a base64-encoded numpy string (inline `mask` field) or a pre-decoded
   * {@link OverlayMask} produced from a `mask_path` fetch.
   */
  private rawMaskData?: string | OverlayMask;
  /** True while an async decode is in flight. */
  private decoding = false;

  /** Raw single-channel pixel data for hit-testing via containsMaskPixel(). */
  private rawPixels?: { src: Uint8Array; width: number; height: number };

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

  constructor(maskData?: SerializedMask | OverlayMask) {
    this.rawMaskData = MaskCanvas.extractSource(maskData);
  }

  /**
   * Normalizes the input mask source to either a base64 string (for inline
   * `mask` data) or a pre-decoded {@link OverlayMask} (for `mask_path` data).
   * Plain `undefined` and `{ $binary: { base64 } }` wrappers are unwrapped.
   */
  private static extractSource(
    mask?: SerializedMask | OverlayMask
  ): string | OverlayMask | undefined {
    if (!mask) return undefined;
    if (typeof mask === "string") return mask;
    if ("$binary" in mask) return mask.$binary.base64;
    return mask;
  }

  /**
   * Replaces the raw mask source data. Returns true if the source actually
   * changed (caller should markDirty). Drops all derived state — decoded
   * bitmap, raw pixels, editing canvas, undo snapshots — so that subsequent
   * renders / hit-tests reflect the new source rather than a stale canvas.
   */
  updateSource(mask?: SerializedMask | OverlayMask): boolean {
    const source = MaskCanvas.extractSource(mask);
    if (source === this.rawMaskData) return false;

    this.reset();
    this.rawMaskData = source;
    return true;
  }

  /**
   * Tears down all derived state (bitmap, raw pixels, editing canvas, undo
   * snapshots, pending encode) and the source data. Leaves the instance
   * usable but empty; the next render decodes from a fresh `rawMaskData` if
   * one is set afterward.
   */
  private reset(): void {
    this.maskBitmap?.close();
    this.maskBitmap = undefined;
    this.rawMaskData = undefined;
    this.rawPixels = undefined;

    this.canvas = undefined;
    this.context = undefined;
    this.pendingMask = undefined;

    this.lastPoint = undefined;

    this.preStrokeSnapshot = undefined;
    this.preStrokeBounds = undefined;
    this.postStrokeSnapshot = undefined;
    this.postStrokeBounds = undefined;
  }

  /**
   * Returns true if a mask is available for rendering (editing canvas or decoded bitmap).
   */
  private hasRenderable(): boolean {
    return this.canvas != null || this.maskBitmap != null;
  }

  /**
   * Kicks off async mask decoding if raw data is present and hasn't been
   * decoded yet. The decoded bitmap is color-INDEPENDENT (white+alpha), so it
   * is decoded once and never re-decoded on a color change — color is applied
   * at draw time via GPU tint. Also populates rawPixels for hit-testing on
   * first decode.
   */
  private decodeMaskIfNeeded(onDecoded?: () => void): void {
    if (!this.rawMaskData || this.decoding) return;

    // Already decoded — the bitmap carries no color, so it stays valid across
    // color changes.
    if (this.maskBitmap) return;

    // Snapshot the source so a concurrent updateSource() can invalidate this
    // decode without stale data overwriting the new source on resolution.
    const sourceToken = this.rawMaskData;
    this.decoding = true;

    decodeMask(sourceToken)
      .then(({ bitmap, rawPixels }) => {
        this.decoding = false;

        // Source changed mid-decode — discard this result. The next render
        // will re-trigger decodeMaskIfNeeded against the current rawMaskData.
        if (this.rawMaskData !== sourceToken) {
          bitmap.close();
          return;
        }

        this.maskBitmap?.close();
        this.maskBitmap = bitmap;

        if (rawPixels) {
          this.rawPixels = rawPixels;
        }

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
    opacity: number,
    onDecoded?: () => void
  ): void {
    this.decodeMaskIfNeeded(onDecoded);

    if (!this.hasRenderable()) return;

    // The canvas/bitmap is color-independent (white+alpha); the overlay color
    // is applied on the GPU via `tint`, so a color change is a re-tint with no
    // per-pixel CPU recolor.
    if (this.canvas) {
      renderer.drawImage(
        { type: "canvas", canvas: this.canvas },
        bounds,
        { opacity, tint: color },
        containerId
      );

      return;
    }

    if (this.maskBitmap) {
      renderer.drawImage(
        { type: "bitmap", bitmap: this.maskBitmap },
        bounds,
        { opacity, tint: color },
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
   * Always sizes the canvas to match the detection bounds so that
   * canvas pixels map 1:1 with sample. When seeding from a
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
      // Disable image smoothing to prevent feathering on fractional pixels
      const prevSmoothing = this.context.imageSmoothingEnabled;
      this.context.imageSmoothingEnabled = false;
      this.context.drawImage(this.maskBitmap, 0, 0, width, height);
      this.context.imageSmoothingEnabled = prevSmoothing;
      this.maskBitmap.close();
      this.maskBitmap = undefined;
    }

    this.rawMaskData = undefined;
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

  /**
   * Tests whether a point in relative coordinates falls on a non-zero mask
   * pixel. Returns `false` when no raw pixel data is available or the point
   * is outside the given relative bounding box.
   */
  containsMaskPixel(relativePoint: Point, relativeBounds: Rect): boolean {
    if (!this.rawPixels) return false;

    const { x, y, width: bw, height: bh } = relativeBounds;

    if (
      relativePoint.x < x ||
      relativePoint.y < y ||
      relativePoint.x > x + bw ||
      relativePoint.y > y + bh
    ) {
      return false;
    }

    const { src, width, height } = this.rawPixels;
    const px = Math.floor(((relativePoint.x - x) / bw) * (width - 1));
    const py = Math.floor(((relativePoint.y - y) / bh) * (height - 1));

    return src[py * width + px] > 0;
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
    if (
      !bounds ||
      bounds.width <= 0 ||
      bounds.height <= 0 ||
      !Number.isFinite(bounds.width) ||
      !Number.isFinite(bounds.height) ||
      !this.canvas
    ) {
      return undefined;
    }

    return {
      x: ((worldPoint.x - bounds.x) / bounds.width) * this.canvas.width,
      y: ((worldPoint.y - bounds.y) / bounds.height) * this.canvas.height,
    };
  }

  private paint(
    point: Point,
    toolState: SegmentationToolState,
    // color comes from the draw-time tint; strokes are painted white
    _style: DrawStyle | undefined
  ) {
    if (!this.context) return;

    const size = toolState.size ?? 0;
    const shape = toolState.shape ?? SegmentationToolShape.Circle;
    const radius = size / 2;

    if (toolState.mode === SegmentationToolMode.Remove) {
      this.context.globalCompositeOperation = "destination-out";
      this.context.fillStyle = "rgba(0,0,0,1)";
    } else {
      this.context.globalCompositeOperation = "source-over";
      // Paint white; the display color is applied at draw time via tint.
      this.context.fillStyle = "#ffffff";
    }

    this.context.beginPath();
    if (shape === SegmentationToolShape.Circle) {
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

    // Compute dab extent: add mode expands bounds, remove mode does not
    let minX = bounds.x;
    let minY = bounds.y;
    let maxX = bounds.x + bounds.width;
    let maxY = bounds.y + bounds.height;

    if (toolState.mode === SegmentationToolMode.Add) {
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
   * Uses the current paint mode (add paints, remove subtracts).
   */
  fillPolygon(
    worldPoints: Point[],
    bounds: Rect,
    toolState: SegmentationToolState,
    // color comes from the draw-time tint; strokes are painted white
    _style: DrawStyle | undefined
  ): Rect | undefined {
    if (worldPoints.length < 3) return undefined;

    this.ensureCanvas(bounds);
    if (!this.context) return undefined;

    if (!this.preStrokeSnapshot) {
      this.paintStart(bounds);
    }

    // Compute polygon extent: add mode expands to contain all points
    let minX = bounds.x;
    let minY = bounds.y;
    let maxX = bounds.x + bounds.width;
    let maxY = bounds.y + bounds.height;

    if (toolState.mode === SegmentationToolMode.Add) {
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

    if (toolState.mode === SegmentationToolMode.Remove) {
      this.context.globalCompositeOperation = "destination-out";
      this.context.fillStyle = "rgba(0,0,0,1)";
    } else {
      this.context.globalCompositeOperation = "source-over";
      // Paint white; the display color is applied at draw time via tint.
      this.context.fillStyle = "#ffffff";
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

  /**
   * Composites another mask's pixels onto this one (binary OR), expanding
   * bounds to the union AABB if needed. Frames the work as a paint operation
   * so the existing pre/post snapshot machinery picks it up — call
   * {@link getPaintStrokeData} after to retrieve before/after for undo.
   *
   * `otherSource` is the source's drawable mask (canvas or bitmap, typically
   * obtained via {@link getPreviewSource}). The threshold pass at the end of
   * {@link paintEnd} snaps composited pixels to opaque white+alpha; the
   * display color is applied per-overlay at draw time via tint.
   */
  mergeFrom(
    otherSource: HTMLCanvasElement | ImageBitmap,
    otherBounds: Rect,
    ourBounds: Rect,
    onEncoded?: (encoded: string) => void
  ): Rect {
    this.ensureCanvas(ourBounds);
    this.paintStart(ourBounds);

    const minX = Math.min(ourBounds.x, otherBounds.x);
    const minY = Math.min(ourBounds.y, otherBounds.y);
    const maxX = Math.max(
      ourBounds.x + ourBounds.width,
      otherBounds.x + otherBounds.width
    );
    const maxY = Math.max(
      ourBounds.y + ourBounds.height,
      otherBounds.y + otherBounds.height
    );

    const newBounds =
      this.updateBounds(ourBounds, { minX, minY, maxX, maxY }) ?? ourBounds;

    if (this.context && this.canvas) {
      const dx =
        ((otherBounds.x - newBounds.x) / newBounds.width) * this.canvas.width;
      const dy =
        ((otherBounds.y - newBounds.y) / newBounds.height) * this.canvas.height;
      const dw = (otherBounds.width / newBounds.width) * this.canvas.width;
      const dh = (otherBounds.height / newBounds.height) * this.canvas.height;

      // Disable smoothing so the source's binary edge pixels don't get
      // bilinear-spread across two destination pixels at fractional offsets.
      // updateCanvas thresholds any non-zero alpha to fully opaque, so without
      // this the anti-aliased fringe would be promoted to solid pixels and
      // the mask would grow by ~1 pixel on each edge.
      const prevSmoothing = this.context.imageSmoothingEnabled;
      this.context.imageSmoothingEnabled = false;
      this.context.globalCompositeOperation = "source-over";
      this.context.drawImage(otherSource, dx, dy, dw, dh);
      this.context.imageSmoothingEnabled = prevSmoothing;
    }

    return this.paintEnd(newBounds, onEncoded);
  }

  paintEnd(bounds: Rect, onEncoded?: (encoded: string) => void): Rect {
    if (!this.canvas) return bounds;

    this.lastPoint = undefined;

    // Rebuild the canvas to threshold anti-aliased edge pixels to white+alpha
    // before computing tight bounds and snapshotting.
    this.updateCanvas(this.canvas.width, this.canvas.height);

    // Snap bounds down to the painted region.
    const finalBounds = this.cropToContent(bounds) ?? bounds;

    this.postStrokeBounds = { ...finalBounds };
    this.postStrokeSnapshot = this.takeSnapshot();

    // Refresh single-channel mask data so hit-testing reflects the edit.
    this.updateRawPixelsFromCanvas();

    const capturedCanvas = this.canvas;
    encodeMask(capturedCanvas)
      .then((encoded) => {
        if (this.canvas !== capturedCanvas) return;
        this.pendingMask = encoded;
        onEncoded?.(encoded);
      })
      .catch((err) => {
        console.error("[MaskCanvas] paintEnd encode failed:", err);
      });

    return finalBounds;
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

  /**
   * Returns the tight inclusive bounding box of opaque pixels on the editing
   * canvas, in canvas-pixel coordinates. Returns `null` when no canvas exists
   * yet, or when the canvas is fully transparent.
   *
   * @see {@link maskBounds} for the shape of the returned box.
   */
  private getBounds(): MaskBounds | null {
    if (!this.canvas || !this.context) return null;

    const { width, height } = this.canvas;
    return maskBounds(this.context.getImageData(0, 0, width, height));
  }

  /**
   * Allocates a new canvas, copies existing pixels into it, and snaps every
   * non-transparent pixel to opaque white while snapping alpha to 0 or 255.
   * The mask is kept color-INDEPENDENT (white+alpha); the display color is
   * applied at draw time via GPU tint. This serves double duty:
   *
   * 1. Resizing the canvas when the mask bounds expand during painting.
   * 2. Eliminating anti-aliased edges produced by Canvas 2D path drawing
   *    (arc/fill always anti-alias) by thresholding alpha to 0 or 255.
   *
   * Runs only on a data change (paint / merge / resize) — never on a color
   * change, which is now a free re-tint.
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

      // Threshold: snap every non-transparent pixel to opaque white,
      // eliminating anti-aliased fringes. Color comes from the draw-time tint.
      const data = imageData.data;

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] > 0) {
          data[i] = 255;
          data[i + 1] = 255;
          data[i + 2] = 255;
          data[i + 3] = 255;
        }
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

    // Existing pixels were shifted by (offsetX, offsetY); the cached lastPoint
    // is in canvas-pixel coords and must be shifted in lockstep so paintLine
    // continues to interpolate from the correct origin after a resize.
    if (this.lastPoint) {
      this.lastPoint = {
        x: this.lastPoint.x + offsetX,
        y: this.lastPoint.y + offsetY,
      };
    }

    return {
      x: minX,
      y: minY,
      width: newWidth,
      height: newHeight,
    };
  }

  /**
   * Crops the editing canvas to the tight bbox of opaque pixels and returns
   * the corresponding world-space bounds. Returns `undefined` when the canvas
   * is already tight, or when it is fully transparent (nothing to crop to).
   */
  private cropToContent(bounds: Rect): Rect | undefined {
    if (!this.canvas || !this.context) return undefined;

    const tight = this.getBounds();
    if (!tight) return undefined;

    const { width, height } = this.canvas;
    const tightW = tight.maxX - tight.minX + 1;
    const tightH = tight.maxY - tight.minY + 1;

    if (
      tight.minX === 0 &&
      tight.minY === 0 &&
      tightW === width &&
      tightH === height
    ) {
      return undefined;
    }

    const pxW = bounds.width / width;
    const pxH = bounds.height / height;

    this.updateCanvas(tightW, tightH, -tight.minX, -tight.minY);

    return {
      x: bounds.x + tight.minX * pxW,
      y: bounds.y + tight.minY * pxH,
      width: tightW * pxW,
      height: tightH * pxH,
    };
  }

  // ---------------------------------------------------------------------------
  // Snapshots (for undo/redo)
  // ---------------------------------------------------------------------------

  /**
   * Rebuilds the single-channel `rawPixels` cache from the current canvas
   * contents so that {@link containsMaskPixel} reflects post-edit state.
   * Treats any pixel with non-zero alpha as set.
   */
  private updateRawPixelsFromCanvas(): void {
    if (!this.canvas || !this.context) {
      this.rawPixels = undefined;
      return;
    }

    const { width, height } = this.canvas;
    const rgba = this.context.getImageData(0, 0, width, height).data;
    const src = new Uint8Array(width * height);

    for (let i = 0; i < src.length; i++) {
      src[i] = rgba[i * 4 + 3] > 0 ? 1 : 0;
    }

    this.rawPixels = { src, width, height };
  }

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
   * "no mask" state). Kicks off `encodeMask` so `pendingMask` stays in sync;
   * `onEncoded` fires once with the encoded payload when that completes.
   */
  restoreSnapshot(
    snapshot: MaskSnapshot | undefined,
    onEncoded?: (encoded: string) => void
  ): void {
    if (!snapshot) {
      this.canvas = undefined;
      this.context = undefined;
      this.lastPoint = undefined;
      this.pendingMask = undefined;
      this.rawPixels = undefined;
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

    // Refresh single-channel mask data so hit-testing reflects the snapshot.
    this.updateRawPixelsFromCanvas();

    const capturedCanvas = this.canvas;
    encodeMask(capturedCanvas)
      .then((encoded) => {
        if (this.canvas !== capturedCanvas) return;
        this.pendingMask = encoded;
        onEncoded?.(encoded);
      })
      .catch((err) => {
        console.error("[MaskCanvas] restoreSnapshot encode failed:", err);
      });
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.reset();
  }
}
