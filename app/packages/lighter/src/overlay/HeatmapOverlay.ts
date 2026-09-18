/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { HEATMAP } from "@fiftyone/utilities";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";
import { createMaskCanvas } from "../utils/createMaskCanvas";
import {
  heatmapPaletteKey,
  type HeatmapPalette,
} from "../utils/heatmapPalette";
import { rasterizeHeatmap } from "../utils/heatmapRaster";
import { decodeMaskPath } from "../utils/maskPathDecoding";
import { PathDecodeCooldown } from "../utils/pathDecodeCooldown";
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
  /**
   * Turns the label's raw `map_path` into a fetchable URL. Without one, an
   * on-disk map cannot be loaded and the overlay paints nothing.
   */
  resolveUrl?: (raw: string) => string | undefined;
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
  #values?: Float32Array;
  #width = 0;
  #height = 0;

  #renderedSource?: string | OverlayMask;
  #renderedPalette?: string;

  #warnedUnsupported = false;

  /** Resolves the label's raw `map_path` into a fetchable URL. */
  readonly #resolveUrl?: (raw: string) => string | undefined;

  /** The map decoded from `map_path`, and the path it came from. */
  #decodedFromPath?: OverlayMask;
  #decodedPath?: string;
  /** The path a decode is in flight for, so a repaint does not restart it. */
  #decodingPath?: string;
  /** Paths whose decode just failed; see {@link PathDecodeCooldown}. */
  readonly #pathCooldown = new PathDecodeCooldown();
  /**
   * Set by `destroy`. A decode in flight outlives the overlay that asked
   * for it, and its continuation would otherwise adopt the result and mark
   * a disposed overlay dirty, which schedules a render against a renderer
   * that is already gone.
   */
  #destroyed = false;

  /**
   * The (source, palette) that failed to rasterize.
   *
   * The reuse check requires a canvas, which a failure leaves unset, so
   * without this a map that cannot be rasterized is retried — and logged — on
   * EVERY repaint. During playback that is thirty times a second.
   */
  #failedKey?: string;

  public cursor = "default";

  constructor(options: HeatmapOverlayOptions) {
    super(options.id, options.field, options.label);
    this.#resolveUrl = options.resolveUrl;
  }

  getOverlayType(): string {
    return "HeatmapOverlay";
  }

  /** A heatmap covers the whole media. */
  get relativeBounds(): Rect {
    return { x: 0, y: 0, width: 1, height: 1 };
  }

  hasValidBounds(): boolean {
    return Boolean(this.label?.map ?? this.label?.map_path);
  }

  protected renderImpl(renderer: Renderer2D, meta: RenderMeta): void {
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
    const source = this.resolveSource();

    if (!source) {
      return undefined;
    }

    const key = heatmapPaletteKey(palette);
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
      this.#failedKey = undefined;
    } catch (error) {
      // one malformed map must not take the whole frame down
      console.error(`[heatmap] failed to rasterize "${this.field}":`, error);
      this.#canvas = undefined;
      this.#values = undefined;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedKey = attempt;
    }

    return this.#canvas;
  }

  /**
   * The map to rasterize: the inline one when the label carries it, else
   * whatever the last `map_path` decode produced.
   *
   * An on-disk map resolves asynchronously, so the first paint after the path
   * changes has nothing to draw. Starting the decode here rather than gating
   * the MOUNT on it is what makes this work per frame: the overlay is one
   * handle reused across the clip, so a gated mount would tear it down and
   * rebuild it on every playhead step.
   */
  private resolveSource(): string | OverlayMask | undefined {
    const inline = this.label?.map;

    if (inline) {
      return inline;
    }

    const path = this.label?.map_path;

    if (!path) {
      return undefined;
    }

    if (this.#decodedPath === path) {
      return this.#decodedFromPath;
    }

    this.startDecode(path);

    return undefined;
  }

  /** Fetch + decode an on-disk map, then repaint. */
  private startDecode(path: string): void {
    if (this.#decodingPath === path || this.#destroyed) {
      return;
    }

    if (this.#pathCooldown.blocked(path)) {
      return;
    }

    const url = this.#resolveUrl?.(path);

    if (!url) {
      this.warnUnresolvableOnce();
      return;
    }

    this.#decodingPath = path;

    void decodeMaskPath(url, this.field ?? "", HEATMAP)
      .then((decoded) => {
        // The label may have moved on while this was in flight — a scrub, or
        // simply the next frame. Adopting a stale decode would paint the
        // wrong frame's map.
        if (this.#destroyed || this.label?.map_path !== path) {
          return;
        }

        // Only remember a SUCCESSFUL decode. `decodeMaskPath` returns
        // undefined on a fetch or decode failure and caches nothing, so
        // recording the path here would pin the overlay to that one failure
        // for the life of the clip — a transient network error and the map
        // never appears again. Leaving it unrecorded lets the next repaint
        // try once more.
        if (!decoded) {
          // Not recorded as decoded — see above — but held off briefly, so a
          // path that keeps failing costs one attempt a second instead of one
          // per repaint.
          this.#pathCooldown.fail(path);
          return;
        }

        this.#decodedFromPath = decoded;
        this.#decodedPath = path;
        this.markDirty();
      })
      .finally(() => {
        if (this.#decodingPath === path) {
          this.#decodingPath = undefined;
        }
      });
  }

  /** Said once per overlay — a per-frame warning would flood playback. */
  private warnUnresolvableOnce(): void {
    if (this.#warnedUnsupported) {
      return;
    }

    this.#warnedUnsupported = true;
    console.warn(
      `[heatmap] "${this.field}" stores its map at map_path, but this ` +
        "surface supplied no way to resolve it to a URL; nothing will paint",
    );
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
    return this.valueAt(point) !== 0;
  }

  applyLabel(label: HeatmapLabel): void {
    super.applyLabel(label);
    this.markDirty();
  }

  destroy(): void {
    // Flagged before anything is torn down: a decode already in flight
    // resolves after this, and its continuation reads the flag rather than
    // adopting a result into a disposed overlay.
    this.#destroyed = true;
    this.#decodingPath = undefined;
    this.#pathCooldown.clear();
    this.#decodedFromPath = undefined;
    this.#decodedPath = undefined;
    this.#canvas = undefined;
    this.#values = undefined;
    super.destroy();
  }
}
