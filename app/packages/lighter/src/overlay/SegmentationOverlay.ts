/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";
import { createMaskCanvas } from "../utils/createMaskCanvas";
import {
  paletteKey,
  type SegmentationPalette,
} from "../utils/segmentationPalette";
import type { RasterizedSegmentation } from "../utils/segmentationRaster";
import { rasterizeSegmentation } from "../utils/segmentationRaster";
import { BaseOverlay } from "./BaseOverlay";

export type SegmentationLabel = RawLookerLabel & {
  /** Base64-encoded compressed numpy, or an already-decoded mask. */
  mask?: string | OverlayMask;
  mask_path?: string;
};

export interface SegmentationOverlayOptions {
  id: string;
  field: string;
  label: SegmentationLabel;
}

/**
 * A full-media indexed mask: every pixel names a target, and each target gets
 * its own color.
 *
 * That per-pixel color is what separates this from a detection mask. A
 * detection's mask is one shape in one color, so it rasterizes to white+alpha
 * once and the renderer tints it on the GPU — a color change costs nothing. A
 * segmentation's colors vary per pixel, so they have to be baked into the RGBA,
 * and a color-scheme change means rasterizing again. Looker's worker painter
 * works the same way, which is why the two agree.
 *
 * The raster is therefore cached against both inputs that can invalidate it —
 * the mask source and the palette — and recomputed only when one of them
 * actually changes. Naively re-rasterizing every paint would redo a
 * megapixel-scale loop on every frame of playback.
 */
export class SegmentationOverlay extends BaseOverlay<SegmentationLabel> {
  /** The rasterized mask, ready to draw. */
  #canvas?: HTMLCanvasElement;
  /**
   * Per-pixel target indices behind `#canvas`, for hit-testing. Typed as the
   * rasterizer returns it — the source mask's width — so a target above 255
   * is reported as itself rather than wrapping.
   */
  #targets?: RasterizedSegmentation["targets"];
  #maskWidth = 0;
  #maskHeight = 0;

  /** What `#canvas` was built from; a mismatch means re-rasterize. */
  #renderedSource?: string | OverlayMask;
  #renderedPalette?: string;

  /** Logged at most once per overlay — a per-frame warning would flood. */
  #warnedUnsupported = false;

  /**
   * The (source, palette) that failed to rasterize.
   *
   * The reuse check requires a canvas, which a failure leaves unset, so
   * without this a mask that cannot be rasterized is retried — and logged —
   * on EVERY repaint. During playback that is thirty times a second.
   */
  #failedKey?: string;

  public cursor = "default";

  constructor(options: SegmentationOverlayOptions) {
    super(options.id, options.field, options.label);
  }

  getOverlayType(): string {
    return "SegmentationOverlay";
  }

  /**
   * The mask covers the whole media, so there is nothing tighter to report.
   * Returned in relative coordinates, like every other overlay's bounds.
   */
  get relativeBounds(): Rect {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  hasValidBounds(): boolean {
    return Boolean(this.label?.mask);
  }

  protected renderImpl(renderer: Renderer2D, meta: RenderMeta): void {
    const style = this.currentStyle;

    if (!style) {
      return;
    }

    const palette = style.segmentationPalette;

    // No palette means the scene has no color context yet (it arrives on the
    // first color-scheme effect). Drawing an uncolored mask would flash a
    // wrong-colored sheet over the media, so wait — the context lands within
    // the frame and marks this overlay dirty.
    if (!palette) {
      return;
    }

    const canvas = this.ensureRaster(palette);

    if (!canvas) {
      return;
    }

    renderer.drawImage(
      { type: "canvas", canvas },
      meta.canonicalMediaBounds,
      { opacity: style.opacity ?? 1 },
      this.containerId,
    );
  }

  /**
   * Rasterize if the mask or the palette changed since the last paint;
   * otherwise hand back what is already there.
   */
  private ensureRaster(
    palette: SegmentationPalette,
  ): HTMLCanvasElement | undefined {
    const source = this.label?.mask;

    if (!source) {
      this.warnUnsupportedOnce();
      return undefined;
    }

    const key = paletteKey(palette);
    const attempt = `${key}::${typeof source === "string" ? source.length : "decoded"}`;

    // Already known bad, and nothing about the inputs has changed.
    if (this.#failedKey === attempt) {
      return undefined;
    }

    if (
      this.#canvas &&
      this.#renderedSource === source &&
      this.#renderedPalette === key
    ) {
      return this.#canvas;
    }

    try {
      const { rgba, width, height, targets } = rasterizeSegmentation(
        source,
        palette,
      );

      const { maskCanvas, maskContext } = createMaskCanvas(width, height);
      maskContext.putImageData(
        new ImageData(new Uint8ClampedArray(rgba), width, height),
        0,
        0,
      );

      this.#canvas = maskCanvas;
      this.#targets = targets;
      this.#maskWidth = width;
      this.#maskHeight = height;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedKey = undefined;
    } catch (error) {
      // A malformed or multi-channel mask must not take the frame down with
      // it — every other overlay in this pass still has to paint.
      console.error(
        `[segmentation] failed to rasterize "${this.field}":`,
        error,
      );
      this.#canvas = undefined;
      this.#targets = undefined;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedKey = attempt;
    }

    return this.#canvas;
  }

  /**
   * `mask_path` masks live on disk and need a resolved media URL to fetch.
   * The video surface supplies no URL resolver yet, so rather than paint
   * nothing and leave the user wondering, say so once.
   */
  private warnUnsupportedOnce(): void {
    if (this.#warnedUnsupported || !this.label?.mask_path) {
      return;
    }

    this.#warnedUnsupported = true;
    console.warn(
      `[segmentation] "${this.field}" stores its mask at mask_path, which ` +
        "this surface cannot resolve yet; nothing will paint for it",
    );
  }

  /** The target index under a relative point, or 0 for background. */
  targetAt(relative: Point): number {
    if (!this.#targets || !this.#maskWidth || !this.#maskHeight) {
      return 0;
    }

    const x = Math.floor(relative.x * this.#maskWidth);
    const y = Math.floor(relative.y * this.#maskHeight);

    if (x < 0 || y < 0 || x >= this.#maskWidth || y >= this.#maskHeight) {
      return 0;
    }

    return this.#targets[y * this.#maskWidth + x];
  }

  /**
   * Only PAINTED pixels count as inside. A segmentation covers the whole
   * media, so reporting its bounds as its hit area would swallow every click
   * meant for an overlay beneath it.
   */
  containsPoint(point: Point): boolean {
    return this.targetAt(point) !== 0;
  }

  applyLabel(label: SegmentationLabel): void {
    super.applyLabel(label);
    // the next paint re-rasterizes: the source changed
    this.markDirty();
  }

  destroy(): void {
    this.#canvas = undefined;
    this.#targets = undefined;
    super.destroy();
  }
}
