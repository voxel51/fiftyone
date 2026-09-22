/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";

import { CONTAINS } from "../core/containment";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";
import { createMaskCanvas } from "../utils/createMaskCanvas";
import { maskSourceOf } from "../utils/maskSource";
import { toRelativePoint } from "../utils/mediaPoint";
import {
  heatmapPaletteKey,
  type HeatmapPalette,
} from "../utils/heatmapPalette";
import { rasterizeHeatmap } from "../utils/heatmapRaster";
import { BaseOverlay } from "./BaseOverlay";

export type HeatmapLabel = RawLookerLabel & {
  /** Base64-encoded compressed numpy, or an already-decoded map. */
  map?: string | OverlayMask;
  map_path?: string;
  /** Declared dynamic range; inferred from the array type when absent. */
  range?: number[] | null;
};

export interface HeatmapOverlayOptions {
  id: string;
  field: string;
  label: HeatmapLabel;
}

/**
 * A full-media field of continuous values.
 *
 * Shares its shape with {@link SegmentationOverlay} — color baked per pixel,
 * raster cached against source and palette — but not its meaning: a
 * segmentation's pixels name categories, a heatmap's carry magnitude. That is
 * why 0 is background in both, and why everything else differs.
 */
export class HeatmapOverlay extends BaseOverlay<HeatmapLabel> {
  #canvas?: HTMLCanvasElement;
  /** Per-pixel values behind `#canvas`, for the tooltip. */
  #values?: Float64Array;
  #width = 0;
  #height = 0;

  /**
   * The media rect the last paint drew into, in canvas pixels. Hit tests
   * arrive in that space and the map is indexed relative to the media, so
   * this is what bridges them.
   */
  #mediaBounds?: Rect;

  #renderedSource?: string | OverlayMask;
  #renderedPalette?: string;

  #warnedUnsupported = false;

  /**
   * The (source, palette) that failed to rasterize.
   *
   * The reuse check requires a canvas, which a failure leaves unset, so
   * without this a map that cannot be rasterized is retried — and logged — on
   * EVERY repaint. During playback that is thirty times a second.
   *
   * The source is held by identity rather than summarized into a key: a string
   * compares by value, a decoded `OverlayMask` by reference, and neither can
   * collide with a different map the way a length or a literal `"decoded"`
   * could. A collision here suppresses a perfectly good map.
   */
  #failedSource?: string | OverlayMask;
  #failedPalette?: string;

  public cursor = "default";

  constructor(options: HeatmapOverlayOptions) {
    super(options.id, options.field, options.label);
  }

  getOverlayType(): string {
    return "HeatmapOverlay";
  }

  /** A heatmap covers the whole media. */
  get relativeBounds(): Rect {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  hasValidBounds(): boolean {
    return Boolean(this.label?.map);
  }

  protected renderImpl(renderer: Renderer2D, meta: RenderMeta): void {
    // Recorded before the early returns: it is the frame's layout, not a
    // product of this paint, and a hit test can arrive between a palette-less
    // frame and the next painted one.
    this.#mediaBounds = meta.canonicalMediaBounds;

    const style = this.currentStyle;

    if (!style) {
      return;
    }

    const palette = style.heatmapPalette;

    // Without a palette the scene has no color context yet; painting now would
    // flash an uncolored sheet over the media.
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

  private ensureRaster(palette: HeatmapPalette): HTMLCanvasElement | undefined {
    // Normalized rather than read straight off the label: `/frames` sends a
    // base64 string, but the GraphQL sample payload sends the same map as
    // `{ $binary: { base64 } }`, and this surface receives both. An unwrapped
    // `$binary` is truthy, so it would reach the rasterizer as an object with
    // no `channels` and fail there instead of painting.
    const source = maskSourceOf(this.label?.map);

    if (!source) {
      // The label no longer carries an inline map — it became `map_path`-only,
      // or lost its map entirely. Stopping at the paint is not enough: the
      // values behind the last raster are what `valueAt` and `containsPoint`
      // answer from, so leaving them would let an invisible overlay keep
      // swallowing clicks for a heatmap that is no longer there.
      this.clearRaster();
      this.warnUnsupportedOnce();
      return undefined;
    }

    const key = heatmapPaletteKey(palette);

    // Already known bad, and nothing about the inputs has changed.
    if (this.#failedSource === source && this.#failedPalette === key) {
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
      const { rgba, width, height, values } = rasterizeHeatmap(source, palette);

      const { maskCanvas, maskContext } = createMaskCanvas(width, height);
      maskContext.putImageData(
        new ImageData(new Uint8ClampedArray(rgba), width, height),
        0,
        0,
      );

      this.#canvas = maskCanvas;
      this.#values = values;
      this.#width = width;
      this.#height = height;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedSource = undefined;
      this.#failedPalette = undefined;
    } catch (error) {
      // one malformed map must not take the whole frame down
      console.error(`[heatmap] failed to rasterize "${this.field}":`, error);
      this.#canvas = undefined;
      this.#values = undefined;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedSource = source;
      this.#failedPalette = key;
    }

    return this.#canvas;
  }

  private warnUnsupportedOnce(): void {
    if (this.#warnedUnsupported || !this.label?.map_path) {
      return;
    }

    this.#warnedUnsupported = true;
    console.warn(
      `[heatmap] "${this.field}" stores its map at map_path, which this ` +
        "surface cannot resolve yet; nothing will paint for it",
    );
  }

  /** The value under a canvas pixel point, or 0 outside the map. */
  valueAtPixel(point: Point): number {
    const relative = toRelativePoint(point, this.#mediaBounds);

    return relative ? this.valueAt(relative) : 0;
  }

  /** The value under a relative point, or 0 outside the map. */
  valueAt(relative: Point): number {
    if (!this.#values || !this.#width || !this.#height) {
      return 0;
    }

    const x = Math.floor(relative.x * this.#width);
    const y = Math.floor(relative.y * this.#height);

    if (x < 0 || y < 0 || x >= this.#width || y >= this.#height) {
      return 0;
    }

    return this.#values[y * this.#width + x];
  }

  /**
   * Only non-zero values count as inside — 0 is background. A heatmap spans
   * the whole media, so hit-testing its bounds would swallow every click
   * meant for an overlay beneath it.
   */
  containsPoint(point: Point): boolean {
    return this.valueAtPixel(point) !== 0;
  }

  /**
   * Without this the base class answers `NONE`, which is what `Scene2D` reads
   * for hover and for ordering — so a heatmap was never hovered and never
   * reordered under the cursor, however strong the value under it.
   */
  getContainmentLevel(point: Point): CONTAINS {
    return this.containsPoint(point) ? CONTAINS.CONTENT : CONTAINS.NONE;
  }

  /**
   * A heatmap has no edge to measure from: it either carries a value at the
   * pixel under the cursor or it does not. Zero when it does puts it ahead of
   * the bounded labels it overlaps, which is how looker orders a dense label.
   */
  getMouseDistance(point: Point): number {
    return this.containsPoint(point) ? 0 : Number.POSITIVE_INFINITY;
  }

  applyLabel(label: HeatmapLabel): void {
    super.applyLabel(label);
    this.markDirty();
  }

  /** Drops the raster and everything hit-testing answers from. */
  private clearRaster(): void {
    this.#canvas = undefined;
    this.#values = undefined;
    this.#width = 0;
    this.#height = 0;
    this.#renderedSource = undefined;
    this.#renderedPalette = undefined;
  }

  destroy(): void {
    this.clearRaster();
    this.#mediaBounds = undefined;
    super.destroy();
  }
}
