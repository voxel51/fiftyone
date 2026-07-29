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
  decodeMaskToRaster,
  encodeMask,
  maskBitmapCache,
  maskBounds,
  maskSourceOf,
  type MaskBounds,
  type MaskSource,
} from "../utils";

import type { DecodedMask } from "../utils/maskDecoding";

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
   * Source whose cache entry {@link maskBitmap} is borrowed from, when it came
   * from {@link maskBitmapCache}. Held separately from `rawMaskData`, which
   * `ensureCanvas` clears while the borrow is still outstanding.
   */
  private borrowedSource?: MaskSource;

  /**
   * Previous frame's decoded mask, drawn while the current frame's source is
   * still decoding so the overlay never blinks to nothing mid-playback. Cleared
   * as soon as the real bitmap lands, or if its decode fails.
   */
  private staleBitmap?: ImageBitmap;
  private staleSource?: MaskSource;
  private stalePixels?: { src: Uint8Array; width: number; height: number };
  /**
   * Source whose decode failed. Skipped by {@link decodeMaskIfNeeded} so a
   * permanently broken mask costs one decode, not one per render. Never
   * cleared: a decode is a pure function of its source, and any edit yields a
   * different source anyway.
   */
  private failedSource?: MaskSource;
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

  /**
   * Count of in-flight async paint/snapshot encodes. While positive, a freshly
   * painted mask hasn't yet produced its `pendingMask`, so the owning overlay
   * must NOT drop the mask on a maskless reproject — destroying the canvas would
   * abort the encode (it bails on canvas-swap) and lose the mask. See
   * {@link DetectionOverlay.applyLabel}.
   */
  private encodingInFlight = 0;

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
   * Normalizes the input mask source to the value the decode pipeline consumes.
   * Delegates to the shared helper so the cache key derived here matches the one
   * readiness checks derive from the same label.
   */
  private static extractSource(
    mask?: SerializedMask | OverlayMask,
  ): MaskSource | undefined {
    return maskSourceOf(mask);
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

    // Never reset while a paint encode is still in flight: those canvas pixels
    // are an uncommitted stroke not yet reflected in any source, so a reconcile
    // echo reproject (which carries the older, pre-stroke value) would drop them
    // — and the in-flight encode bails on the canvas swap, losing the stroke for
    // good. Once the encode has resolved the pixels live in `source`, so a reset
    // here is recoverable (ensureCanvas re-seeds from `rawMaskData`).
    if (this.encodingInFlight > 0) return false;

    if (source) {
      // Hold the outgoing bitmap as a fallback so the mask doesn't blink out
      // while the incoming source decodes. Playback advances frames faster
      // than an uncached decode resolves, so clearing here shows a maskless
      // frame and reads as flicker; the previous frame's mask is a far better
      // stand-in for the fraction of a frame it takes the real one to land.
      this.retainStale();
    } else {
      // A vanishing mask has no incoming decode to converge on — a retained
      // fallback would be drawn (and hit-tested) forever.
      this.releaseStale();
    }

    this.reset();
    this.rawMaskData = source;
    return true;
  }

  /**
   * Move the current bitmap aside as the hold-last fallback, transferring its
   * cache borrow rather than releasing it. `rawPixels` moves with it so
   * hit-testing agrees with what is actually on screen.
   */
  private retainStale(): void {
    if (!this.maskBitmap) {
      return;
    }

    this.releaseStale();

    this.staleBitmap = this.maskBitmap;
    this.staleSource = this.borrowedSource;
    this.stalePixels = this.rawPixels;

    // Ownership moved to the stale slot — clear these so `reset`'s
    // `releaseBitmap` doesn't hand the borrow back while we're still drawing it.
    this.maskBitmap = undefined;
    this.borrowedSource = undefined;
  }

  /** Drop the hold-last fallback, returning its borrow. */
  private releaseStale(): void {
    if (this.staleSource !== undefined) {
      maskBitmapCache.release(this.staleSource);
    } else {
      this.staleBitmap?.close();
    }

    this.staleBitmap = undefined;
    this.staleSource = undefined;
    this.stalePixels = undefined;
  }

  /**
   * Tears down all derived state (bitmap, raw pixels, editing canvas, undo
   * snapshots, pending encode) and the source data. Leaves the instance
   * usable but empty; the next render decodes from a fresh `rawMaskData` if
   * one is set afterward.
   */
  private reset(): void {
    this.releaseBitmap();
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
    return (
      this.canvas != null || this.maskBitmap != null || this.staleBitmap != null
    );
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

    // A cache hit is adopted synchronously so the mask paints in the same tick
    // as the frame advance that asked for it. Deferring a hit to a microtask
    // would reintroduce exactly the one-frame lag the cache exists to remove.
    const cached = maskBitmapCache.acquire(sourceToken);

    if (cached) {
      this.adoptDecoded(sourceToken, cached);
      return;
    }

    // After the cache probe, not before: if this source ever does become
    // resident (another consumer decoded it), the hit above still draws it.
    if (sourceToken === this.failedSource) {
      return;
    }

    this.decoding = true;
    void this.decodeUntilCurrent(onDecoded);
  }

  /**
   * Decode until the result matches the CURRENT source, then adopt it.
   *
   * Retrying rather than discarding is what makes the mask converge. A single
   * attempt that resolves stale has nowhere to hand off to: `decodeMaskIfNeeded`
   * is gated on `decoding`, so a frame advance during the decode gets no decode
   * of its own, and the stale resolution triggers no re-render — leaving the
   * previous frame's mask on screen until some unrelated event repaints. Under
   * CPU load that window covers most frame advances.
   *
   * Mirrors the retry in the engine's Lighter bridge (`mountWhenDecoded`), which
   * loops for the same reason. The synchronous cache-hit path stays in
   * {@link decodeMaskIfNeeded} so a hit is still adopted in the calling tick.
   */
  private async decodeUntilCurrent(onDecoded?: () => void): Promise<void> {
    // Tracked outside the loop so the catch blacklists the source that
    // actually failed, not whatever `rawMaskData` has moved on to since.
    let sourceToken = this.rawMaskData;

    try {
      for (;;) {
        sourceToken = this.rawMaskData;

        if (!sourceToken) {
          return;
        }

        const cached = maskBitmapCache.acquire(sourceToken);

        if (cached) {
          this.adoptDecoded(sourceToken, cached);
          onDecoded?.();
          return;
        }

        const decoded = await maskBitmapCache.acquireAsync(sourceToken);

        // Source moved on while we were decoding — return this borrow and go
        // again against whatever is current now.
        if (this.rawMaskData !== sourceToken) {
          maskBitmapCache.release(sourceToken);
          continue;
        }

        this.adoptDecoded(sourceToken, decoded);
        onDecoded?.();

        return;
      }
    } catch (err) {
      console.error("[MaskCanvas] mask decode failed:", err);
      this.failedSource = sourceToken;

      // Nothing is coming, so stop showing the previous frame's mask — a stale
      // mask held indefinitely is worse than none.
      this.releaseStale();
      onDecoded?.();
    } finally {
      this.decoding = false;
    }
  }

  /** Take up a freshly-acquired borrow, returning any previous one. */
  private adoptDecoded(source: MaskSource, decoded: DecodedMask): void {
    this.releaseBitmap();

    this.maskBitmap = decoded.bitmap;
    this.borrowedSource = source;

    if (decoded.rawPixels) {
      // Shared with every other borrower of this source — read-only.
      this.rawPixels = decoded.rawPixels;
    }

    // The real mask is up; the hold-last fallback has done its job.
    this.releaseStale();
  }

  /**
   * Give up the current bitmap: a borrow goes back to the cache (which decides
   * when to close it), anything self-owned is closed here.
   */
  private releaseBitmap(): void {
    if (this.borrowedSource !== undefined) {
      maskBitmapCache.release(this.borrowedSource);
    } else {
      this.maskBitmap?.close();
    }

    this.borrowedSource = undefined;
    this.maskBitmap = undefined;
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
    onDecoded?: () => void,
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
        containerId,
      );

      return;
    }

    if (this.maskBitmap) {
      renderer.drawImage(
        { type: "bitmap", bitmap: this.maskBitmap },
        bounds,
        { opacity, tint: color },
        containerId,
      );

      return;
    }

    if (this.staleBitmap) {
      // Hold-last: the incoming source is still decoding. Drawn at the CURRENT
      // frame's bounds, so a moving track's mask tracks the box rather than
      // lagging a frame behind it.
      renderer.drawImage(
        { type: "bitmap", bitmap: this.staleBitmap },
        bounds,
        { opacity, tint: color },
        containerId,
      );
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
      // `drawImage` copied the pixels into our canvas, so the borrow is done.
      // Releasing rather than closing leaves the entry usable by other frames.
      this.releaseBitmap();
    } else if (this.rawMaskData) {
      // No decoded bitmap yet — e.g. `updateSource` just reset us from a
      // reconcile reproject (echo or undo) and the async decode hasn't run. Seed
      // the canvas synchronously from the raw source so a stroke that begins now
      // paints onto the existing mask instead of a blank canvas (the mask-drop
      // bug).
      this.seedCanvasFromRawSync(width, height);
    }

    this.rawMaskData = undefined;
  }

  /**
   * Synchronously rasterizes {@link rawMaskData} into the (already-created)
   * editing canvas, scaled to fit. The raster is color-INDEPENDENT (white+alpha)
   * to match painted strokes; the display color is applied at draw time via
   * tint. Best-effort: a decode failure leaves the canvas blank rather than
   * throwing, matching the pre-seed behavior.
   */
  private seedCanvasFromRawSync(width: number, height: number): void {
    if (!this.rawMaskData || !this.context) return;

    try {
      const {
        rgba,
        width: srcWidth,
        height: srcHeight,
        rawPixels,
      } = decodeMaskToRaster(this.rawMaskData);

      const { maskCanvas: srcCanvas, maskContext: srcContext } =
        createMaskCanvas(srcWidth, srcHeight);
      srcContext.putImageData(
        new ImageData(new Uint8ClampedArray(rgba), srcWidth, srcHeight),
        0,
        0,
      );

      const prevSmoothing = this.context.imageSmoothingEnabled;
      this.context.imageSmoothingEnabled = false;
      this.context.drawImage(srcCanvas, 0, 0, width, height);
      this.context.imageSmoothingEnabled = prevSmoothing;

      // Keep hit-testing working immediately: ensureCanvas clears `rawMaskData`
      // right after this, so the async decode never runs to backfill
      // `rawPixels`. Adopt the freshly rasterized pixels now (they're at the
      // mask's native resolution, which is what containsMaskPixel maps against).
      this.rawPixels = { src: rawPixels, width: srcWidth, height: srcHeight };
    } catch (err) {
      console.error("[MaskCanvas] ensureCanvas sync seed failed:", err);
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

  /** True while a paint/snapshot encode is still resolving (no `pendingMask` yet). */
  hasPendingEncode(): boolean {
    return this.encodingInFlight > 0;
  }

  /**
   * Returns the current mask as a drawable source for sidebar preview.
   * Prefers the editing canvas (most up-to-date), falls back to decoded bitmap.
   */
  getPreviewSource(): HTMLCanvasElement | ImageBitmap | undefined {
    return this.canvas ?? this.maskBitmap ?? this.staleBitmap;
  }

  /**
   * Tests whether a point in relative coordinates falls on a non-zero mask
   * pixel. Returns `false` when no raw pixel data is available or the point
   * is outside the given relative bounding box.
   */
  containsMaskPixel(relativePoint: Point, relativeBounds: Rect): boolean {
    // Fall back to the hold-last pixels so hit-testing agrees with whatever is
    // actually on screen while an incoming source decodes.
    const pixels = this.rawPixels ?? this.stalePixels;

    if (!pixels) return false;

    const { x, y, width: bw, height: bh } = relativeBounds;

    if (
      relativePoint.x < x ||
      relativePoint.y < y ||
      relativePoint.x > x + bw ||
      relativePoint.y > y + bh
    ) {
      return false;
    }

    const { src, width, height } = pixels;
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
    _style: DrawStyle | undefined,
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
    style: DrawStyle | undefined,
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
    _style: DrawStyle | undefined,
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
    onEncoded?: (encoded: string) => void,
  ): Rect {
    this.ensureCanvas(ourBounds);
    this.paintStart(ourBounds);

    const minX = Math.min(ourBounds.x, otherBounds.x);
    const minY = Math.min(ourBounds.y, otherBounds.y);
    const maxX = Math.max(
      ourBounds.x + ourBounds.width,
      otherBounds.x + otherBounds.width,
    );
    const maxY = Math.max(
      ourBounds.y + ourBounds.height,
      otherBounds.y + otherBounds.height,
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
    this.encodingInFlight++;
    encodeMask(capturedCanvas)
      .then((encoded) => {
        if (this.canvas !== capturedCanvas) return;
        this.pendingMask = encoded;
        onEncoded?.(encoded);
      })
      .catch((err) => {
        console.error("[MaskCanvas] paintEnd encode failed:", err);
      })
      .finally(() => {
        this.encodingInFlight--;
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
    style: DrawStyle | undefined,
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
    offsetY = 0,
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
    extent: { minX: number; minY: number; maxX: number; maxY: number },
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
    onEncoded?: (encoded: string) => void,
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
      snapshot.height,
    );
    maskContext.putImageData(snapshot.imageData, 0, 0);

    this.canvas = maskCanvas;
    this.context = maskContext;
    this.lastPoint = undefined;

    // Refresh single-channel mask data so hit-testing reflects the snapshot.
    this.updateRawPixelsFromCanvas();

    const capturedCanvas = this.canvas;
    this.encodingInFlight++;
    encodeMask(capturedCanvas)
      .then((encoded) => {
        if (this.canvas !== capturedCanvas) return;
        this.pendingMask = encoded;
        onEncoded?.(encoded);
      })
      .catch((err) => {
        console.error("[MaskCanvas] restoreSnapshot encode failed:", err);
      })
      .finally(() => {
        this.encodingInFlight--;
      });
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  destroy(): void {
    this.reset();
    // `reset` deliberately leaves the hold-last slot alone (a source swap moves
    // the bitmap there and then resets); teardown has to return that borrow.
    this.releaseStale();
  }
}
