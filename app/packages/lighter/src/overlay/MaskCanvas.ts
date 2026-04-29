/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { SerializedMask } from "@fiftyone/utilities";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, Rect } from "../types";
import { decodeMask } from "../utils";

/**
 * Manages mask decoding and rendering for a detection overlay. Owns the
 * decoded bitmap and the single-channel pixel buffer used for hit-testing.
 *
 * ```
 * rawMaskData ──(decodeMask)──> maskBitmap   (color-painted, for rendering)
 *                               rawPixels    (single-channel, for hit-testing)
 * ```
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

  /** Raw single-channel pixel data for hit-testing via containsMaskPixel(). */
  private rawPixels?: { src: Uint8Array; width: number; height: number };

  constructor(maskData?: SerializedMask) {
    this.rawMaskData = MaskCanvas.extractB64(maskData);
  }

  /**
   * Extracts the base64 string from a SerializedMask, which may be a plain
   * string or a `{ $binary: { base64: string } }` wrapper.
   */
  private static extractB64(mask?: SerializedMask): string | undefined {
    if (!mask) return undefined;
    if (typeof mask === "string") return mask;
    return mask.$binary.base64;
  }

  /**
   * Replaces the raw mask source data. Returns true if the source actually
   * changed (caller should markDirty). Drops all derived state so subsequent
   * renders / hit-tests reflect the new source.
   */
  updateSource(mask?: SerializedMask): boolean {
    const b64 = MaskCanvas.extractB64(mask);
    if (b64 === this.rawMaskData) return false;

    this.reset();
    this.rawMaskData = b64;
    return true;
  }

  /**
   * Tears down all derived state (bitmap, raw pixels, decoded-color cache)
   * and the source data. Leaves the instance usable but empty.
   */
  private reset(): void {
    this.maskBitmap?.close();
    this.maskBitmap = undefined;
    this.rawMaskData = undefined;
    this.rawPixels = undefined;
    this.decodedColor = undefined;
  }

  /**
   * Kicks off async mask decoding if raw data is present and hasn't been
   * decoded yet (or needs re-decoding due to color change).
   * Also populates rawPixels for hit-testing on first decode.
   */
  private decodeMaskIfNeeded(color: string, onDecoded?: () => void): void {
    if (!this.rawMaskData || this.decoding) return;

    // Already decoded with this color
    if (this.maskBitmap && this.decodedColor === color) return;

    // Snapshot the source so a concurrent updateSource() can invalidate this
    // decode without stale data overwriting the new source on resolution.
    const sourceToken = this.rawMaskData;
    this.decoding = true;

    decodeMask(sourceToken, color)
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
        this.decodedColor = color;

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
   * Draws the mask within the given bounds. Triggers lazy decode on first
   * call when color is known.
   */
  render(
    renderer: Renderer2D,
    bounds: Rect,
    containerId: string,
    color: string,
    opacity: number,
    onDecoded?: () => void
  ): void {
    this.decodeMaskIfNeeded(color, onDecoded);

    if (!this.maskBitmap) return;

    renderer.drawImage(
      { type: "bitmap", bitmap: this.maskBitmap },
      bounds,
      { opacity },
      containerId
    );
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

  destroy(): void {
    this.reset();
  }
}
