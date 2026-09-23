/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { SEGMENTATION } from "@fiftyone/utilities";

import {
  LABEL_ARCHETYPE_PRIORITY,
  SELECTED_DASH_LENGTH,
  STROKE_WIDTH,
} from "../constants";
import { CONTAINS } from "../core/containment";
import type { Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";
import { getSimpleStrokeStyles } from "../utils/colorMapping";
import { maskSourceOf } from "../utils/maskSource";
import { toRelativePoint } from "../utils/mediaPoint";
import {
  colorForTarget,
  paletteKey,
  type SegmentationPalette,
} from "../utils/segmentationPalette";
import {
  buildSegmentationLut,
  decodeSegmentationIndices,
} from "../utils/segmentationIndices";
import type { IndexedImage } from "../renderer/Renderer2D";
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
export class SegmentationOverlay
  extends BaseOverlay<SegmentationLabel>
  implements Selectable
{
  /**
   * The mask as the renderer draws it: per-pixel target indices plus the
   * palette as a lookup table, colored on the GPU. The indices double as the
   * hit-test surface — they are the decoded mask itself, so a target above
   * 255 is reported as itself rather than wrapping.
   */
  #indexed?: IndexedImage;

  /**
   * The media rect the last paint drew into, in canvas pixels. Hit tests
   * arrive in that space and the mask is indexed relative to the media, so
   * this is what bridges them.
   */
  #mediaBounds?: Rect;

  /** What `#indexed` was built from; a mismatch means re-decode / re-table. */
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
   *
   * The source is held by identity rather than summarized into a key: a
   * string compares by value, a decoded `OverlayMask` by reference, and
   * neither can collide with a different mask the way a length or a literal
   * `"decoded"` could. A collision here suppresses a perfectly good mask.
   */
  #failedSource?: string | OverlayMask;
  #failedPalette?: string;

  #isSelectedState = false;

  /**
   * Where the pointer last was while hovering, in canvas pixels. The tooltip
   * names the target UNDER the cursor, and `getTooltipInfo` takes no point,
   * so the hover handlers keep it here.
   */
  #hoverPoint?: Point;

  public cursor = "pointer";

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
    // Recorded before the early returns: it is the frame's layout, not a
    // product of this paint, and a hit test can arrive between a style-less
    // frame and the next painted one.
    this.#mediaBounds = meta.canonicalMediaBounds;

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

    const indexed = this.ensureIndexed(palette);

    if (!indexed) {
      return;
    }

    renderer.drawImage(
      { type: "indexed", indexed },
      meta.canonicalMediaBounds,
      { opacity: style.opacity ?? 1 },
      this.containerId,
    );

    this.renderSelection(renderer, meta, palette);
  }

  /**
   * Selection outline: a solid stroke in the field's color around the media,
   * with a dashed light stroke over it.
   *
   * A mask has no shape to outline — it covers the whole frame — so the
   * media rect is the only honest boundary to draw, which is what the grid
   * does for these types too. Drawn in ONE color even when the pixels are
   * colored per value: the outline says "this label is selected", and picking
   * one target's color to say it would be arbitrary.
   */
  private renderSelection(
    renderer: Renderer2D,
    meta: RenderMeta,
    palette: SegmentationPalette,
  ): void {
    if (!this.#isSelectedState) {
      return;
    }

    const strokeColor = palette.fieldColor;

    renderer.drawRect(
      meta.canonicalMediaBounds,
      { strokeStyle: strokeColor, lineWidth: STROKE_WIDTH },
      this.containerId,
    );

    const { overlayStrokeColor, overlayDash } = getSimpleStrokeStyles({
      isSelected: true,
      strokeColor,
      isHovered: false,
      dashLength: SELECTED_DASH_LENGTH,
    });

    if (overlayStrokeColor && overlayDash) {
      renderer.drawRect(
        meta.canonicalMediaBounds,
        {
          strokeStyle: overlayStrokeColor,
          lineWidth: STROKE_WIDTH,
          dashPattern: [overlayDash, overlayDash],
        },
        this.containerId,
      );
    }
  }

  /**
   * Decode the mask and table the palette if either changed since the last
   * paint; otherwise hand back what is already there. The two are cached
   * independently: a new frame keeps the table when the palette is the same
   * (for an 8-bit mask, whose table covers every possible target), and a
   * color-scheme change keeps the decoded indices.
   */
  private ensureIndexed(
    palette: SegmentationPalette,
  ): IndexedImage | undefined {
    const source = this.resolveSource(palette);

    if (!source) {
      // Nothing resolvable right now: no inline mask, and either no
      // `mask_path` at all or one still decoding. Stopping at the paint is
      // not enough — the targets behind the last raster are what `targetAt`
      // and `containsPoint` answer from, so leaving them would let an
      // unpainted overlay go on swallowing clicks for a mask that is not on
      // screen. A path decode that lands repaints and repopulates it.
      this.clearRaster();
      return undefined;
    }

    const key = paletteKey(palette);

    // Already known bad, and nothing about the inputs has changed.
    if (this.#failedSource === source && this.#failedPalette === key) {
      return undefined;
    }

    const previous = this.#indexed;
    const sameSource =
      previous !== undefined && this.#renderedSource === source;
    const samePalette = previous !== undefined && this.#renderedPalette === key;

    if (sameSource && samePalette) {
      return previous;
    }

    try {
      const decoded = sameSource
        ? {
            indices: previous.indices,
            width: previous.width,
            height: previous.height,
          }
        : decodeSegmentationIndices(source);

      // An 8-bit table covers every target the mask could hold, so it
      // outlives the frame; a 16-bit one is built for the targets present.
      const reusableLut =
        samePalette && decoded.indices instanceof Uint8Array
          ? previous.lut
          : undefined;

      this.#indexed = {
        ...decoded,
        lut: reusableLut ?? buildSegmentationLut(decoded.indices, palette),
      };
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedSource = undefined;
      this.#failedPalette = undefined;
    } catch (error) {
      // A malformed or multi-channel mask must not take the frame down with
      // it — every other overlay in this pass still has to paint.
      console.error(`[segmentation] failed to decode "${this.field}":`, error);
      this.#indexed = undefined;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedSource = source;
      this.#failedPalette = key;
    }

    return this.#indexed;
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
  private resolveSource(
    palette: SegmentationPalette,
  ): string | OverlayMask | undefined {
    // Normalized rather than read straight off the label: `/frames` sends a
    // base64 string, but the GraphQL sample payload sends the same mask as
    // `{ $binary: { base64 } }`, and this surface receives both. An unwrapped
    // `$binary` is truthy, so it would reach the rasterizer as an object with
    // no `channels` and fail there instead of painting.
    const inline = maskSourceOf(this.label?.mask);

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

    this.startDecode(path, palette);

    return undefined;
  }

  /** Fetch + decode an on-disk mask, then repaint. */
  private startDecode(path: string, palette: SegmentationPalette): void {
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

    // The decoder needs the targets to tell an RGB-keyed mask (keep the
    // channels) from an indexed one (one channel); the palette carries them
    // as the dataset declared them.
    void decodeMaskPath(
      url,
      this.field ?? "",
      SEGMENTATION,
      palette.maskTargets,
    )
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
    const indexed = this.#indexed;

    if (!indexed) {
      return 0;
    }

    const { indices, width, height } = indexed;
    const x = Math.floor(relative.x * width);
    const y = Math.floor(relative.y * height);

    if (x < 0 || y < 0 || x >= width || y >= height) {
      return 0;
    }

    return indices[y * width + x];
  }

  /** The target index under a canvas pixel point, or 0 for background. */
  targetAtPixel(point: Point): number {
    const relative = toRelativePoint(point, this.#mediaBounds);

    return relative ? this.targetAt(relative) : 0;
  }

  /**
   * Only PAINTED pixels count as inside. A segmentation covers the whole
   * media, so reporting its bounds as its hit area would swallow every click
   * meant for an overlay beneath it.
   *
   * The point arrives in canvas pixels, like every other overlay's.
   */
  containsPoint(point: Point): boolean {
    return this.targetAtPixel(point) !== 0;
  }

  /**
   * Without this the base class answers `NONE`, which is what `Scene2D` reads
   * for hover and for ordering — so a mask was never hovered and never
   * reordered under the cursor, however opaque the pixel under it.
   */
  getContainmentLevel(point: Point): CONTAINS {
    return this.containsPoint(point) ? CONTAINS.CONTENT : CONTAINS.NONE;
  }

  /**
   * A mask has no edge to measure from: it either painted the pixel under the
   * cursor or it did not. Zero when it did puts it ahead of the bounded
   * labels it overlaps, which is how looker orders a dense label.
   */
  getMouseDistance(point: Point): number {
    return this.containsPoint(point) ? 0 : Number.POSITIVE_INFINITY;
  }

  applyLabel(label: SegmentationLabel): void {
    super.applyLabel(label);
    // the next paint re-rasterizes: the source changed
    this.markDirty();
  }

  // ---------------------------------------------------------------------------
  // Hoverable
  // ---------------------------------------------------------------------------

  override onHoverEnter(
    point: Point | null,
    event: PointerEvent | null,
  ): boolean {
    this.#hoverPoint = point ?? undefined;
    return super.onHoverEnter(point, event);
  }

  override onHoverMove(
    point?: Point | null,
    event?: PointerEvent | null,
  ): boolean {
    this.#hoverPoint = point ?? undefined;
    return super.onHoverMove(point, event);
  }

  override onHoverLeave(
    point?: Point | null,
    event?: PointerEvent | null,
  ): boolean {
    this.#hoverPoint = undefined;
    return super.onHoverLeave?.(point, event) ?? true;
  }

  /**
   * What the modal tooltip shows for the pixel under the cursor: the target
   * index, which the tooltip resolves to its mask-target name itself, bordered
   * in that target's color. The mask bytes are dropped from the label copy —
   * the tooltip never shows them, and a base64 mask per hover-move is a lot
   * of state to churn for nothing.
   */
  getTooltipInfo(): {
    color: string;
    field: string;
    label: SegmentationLabel;
    type: string;
    target: number;
  } | null {
    const palette = this.currentStyle?.segmentationPalette;

    if (!palette) {
      return null;
    }

    const target = this.#hoverPoint ? this.targetAtPixel(this.#hoverPoint) : 0;

    return {
      color: colorForTarget(target, palette) ?? palette.fieldColor,
      field: this.field || "unknown",
      label: { ...this.label, mask: undefined },
      type: "Segmentation",
      target,
    };
  }

  // ---------------------------------------------------------------------------
  // Selectable
  // ---------------------------------------------------------------------------

  isSelected(): boolean {
    return this.#isSelectedState;
  }

  setSelected(selected: boolean): void {
    if (this.#isSelectedState === selected) {
      return;
    }

    this.#isSelectedState = selected;
    // the outline is part of the paint, so the pass has to run again
    this.markDirty();
  }

  toggleSelected(): boolean {
    this.setSelected(!this.#isSelectedState);
    return this.#isSelectedState;
  }

  getSelectionPriority(): number {
    return LABEL_ARCHETYPE_PRIORITY.SEGMENTATION;
  }

  /** Drops the decoded mask and everything hit-testing answers from. */
  private clearRaster(): void {
    this.#indexed = undefined;
    this.#renderedSource = undefined;
    this.#renderedPalette = undefined;
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
    this.clearRaster();
    this.#mediaBounds = undefined;
    super.destroy();
  }
}
