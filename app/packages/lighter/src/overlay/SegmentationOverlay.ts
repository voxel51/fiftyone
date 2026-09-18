/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { SEGMENTATION } from "@fiftyone/utilities";

import type { Renderer2D } from "../renderer/Renderer2D";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";
import { createMaskCanvas } from "../utils/createMaskCanvas";
import {
  paletteKey,
  type SegmentationPalette,
} from "../utils/segmentationPalette";
import type { RasterizedSegmentation } from "../utils/segmentationRaster";
import { rasterizeSegmentation } from "../utils/segmentationRaster";
import { decodeMaskPath } from "../utils/maskPathDecoding";
import { PathDecodeCooldown } from "../utils/pathDecodeCooldown";
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
  /**
   * Turns the label's raw `mask_path` into a fetchable URL. Without one, an
   * on-disk mask cannot be loaded and the overlay paints nothing.
   */
  resolveUrl?: (raw: string) => string | undefined;
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

  /** Resolves the label's raw `mask_path` into a fetchable URL. */
  readonly #resolveUrl?: (raw: string) => string | undefined;

  /** The mask decoded from `mask_path`, and the path it came from. */
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
   * without this a mask that cannot be rasterized is retried — and logged —
   * on EVERY repaint. During playback that is thirty times a second.
   */
  #failedKey?: string;

  public cursor = "default";

  constructor(options: SegmentationOverlayOptions) {
    super(options.id, options.field, options.label);
    this.#resolveUrl = options.resolveUrl;
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
    return Boolean(this.label?.mask ?? this.label?.mask_path);
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
    const source = this.resolveSource();

    if (!source) {
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
   * The mask to rasterize: the inline one when the label carries it, else
   * whatever the last `mask_path` decode produced.
   *
   * An on-disk mask resolves asynchronously, so the first paint after the
   * path changes has nothing to draw. Starting the decode here rather than
   * gating the MOUNT on it is what makes this work per frame: the overlay is
   * one handle reused across the clip, so a gated mount would tear it down
   * and rebuild it on every playhead step.
   */
  private resolveSource(): string | OverlayMask | undefined {
    const inline = this.label?.mask;

    if (inline) {
      return inline;
    }

    const path = this.label?.mask_path;

    if (!path) {
      return undefined;
    }

    if (this.#decodedPath === path) {
      return this.#decodedFromPath;
    }

    this.startDecode(path);

    return undefined;
  }

  /** Fetch + decode an on-disk mask, then repaint. */
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

    void decodeMaskPath(url, this.field ?? "", SEGMENTATION)
      .then((decoded) => {
        // The label may have moved on while this was in flight — a scrub, or
        // simply the next frame. Adopting a stale decode would paint the
        // wrong frame's mask.
        if (this.#destroyed || this.label?.mask_path !== path) {
          return;
        }

        // Only remember a SUCCESSFUL decode. `decodeMaskPath` returns
        // undefined on a fetch or decode failure and caches nothing, so
        // recording the path here would pin the overlay to that one failure
        // for the life of the clip — a transient network error and the mask
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
      `[segmentation] "${this.field}" stores its mask at mask_path, but this ` +
        "surface supplied no way to resolve it to a URL; nothing will paint",
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
    // Flagged before anything is torn down: a decode already in flight
    // resolves after this, and its continuation reads the flag rather than
    // adopting a result into a disposed overlay.
    this.#destroyed = true;
    this.#decodingPath = undefined;
    this.#pathCooldown.clear();
    this.#decodedFromPath = undefined;
    this.#decodedPath = undefined;
    this.#canvas = undefined;
    this.#targets = undefined;
    super.destroy();
  }
}
