/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { OverlayMask } from "@fiftyone/looker/src/numpy";
import { HEATMAP } from "@fiftyone/utilities";

import {
  LABEL_ARCHETYPE_PRIORITY,
  SELECTED_DASH_LENGTH,
  STROKE_WIDTH,
} from "../constants";
import { CONTAINS } from "../core/containment";
import type { IndexedImage, Renderer2D } from "../renderer/Renderer2D";
import type { Selectable } from "../selection/Selectable";
import type { Point, RawLookerLabel, Rect, RenderMeta } from "../types";
import { getSimpleStrokeStyles } from "../utils/colorMapping";
import { heatmapIndexCache, heatmapIndexKey } from "../utils/decodedIndexCache";
import {
  buildHeatmapLut,
  decodeHeatmapIndices,
  type DecodedHeatmap,
} from "../utils/heatmapIndices";
import { maskSourceOf } from "../utils/maskSource";
import { toRelativePoint } from "../utils/mediaPoint";
import {
  heatmapPaletteKey,
  type HeatmapPalette,
} from "../utils/heatmapPalette";
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
 * Shares its shape with {@link SegmentationOverlay} — values quantized to
 * indices, colored on the GPU through a lookup table, both cached against
 * source and palette — but not its meaning: a segmentation's pixels name
 * categories, a heatmap's carry magnitude. That is why 0 is background in
 * both, and why everything else differs.
 */
export class HeatmapOverlay
  extends BaseOverlay<HeatmapLabel>
  implements Selectable
{
  /** The quantized map and its color table, as the renderer draws them. */
  #indexed?: IndexedImage;
  /** What `#indexed` was quantized from; also answers the tooltip. */
  #decoded?: DecodedHeatmap;
  /** The declared range `#decoded` was quantized over. */
  #decodedRange?: string;
  /** The (palette, range) `#indexed.lut` was built for. */
  #lutKey?: string;

  /**
   * The media rect the last paint drew into, in canvas pixels. Hit tests
   * arrive in that space and the map is indexed relative to the media, so
   * this is what bridges them.
   */
  #mediaBounds?: Rect;

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
   * The reuse check requires decoded indices, which a failure leaves unset,
   * so without this a map that cannot be decoded is retried — and logged — on
   * EVERY repaint. During playback that is thirty times a second.
   *
   * The source is held by identity rather than summarized into a key: a string
   * compares by value, a decoded `OverlayMask` by reference, and neither can
   * collide with a different map the way a length or a literal `"decoded"`
   * could. A collision here suppresses a perfectly good map.
   */
  #failedSource?: string | OverlayMask;
  #failedPalette?: string;

  #isSelectedState = false;

  /**
   * Where the pointer last was while hovering, in canvas pixels. The tooltip
   * reports the value UNDER the cursor, and `getTooltipInfo` takes no point,
   * so the hover handlers keep it here.
   */
  #hoverPoint?: Point;

  public cursor = "pointer";

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
   * A map has no shape to outline — it covers the whole frame — so the
   * media rect is the only honest boundary to draw, which is what the grid
   * does for these types too. Drawn in ONE color even when the pixels are
   * colored per value: the outline says "this label is selected", and picking
   * one target's color to say it would be arbitrary.
   */
  private renderSelection(
    renderer: Renderer2D,
    meta: RenderMeta,
    palette: HeatmapPalette,
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
   * The map's indices: decoded ahead of time when the label stream warmed
   * this frame (see {@link heatmapIndexCache}), otherwise quantized here and
   * remembered. Only an inline map is cached: a `map_path` source is already
   * decoded, and keying by that object would pin it for the cache's lifetime.
   */
  private decodeIndices(
    source: string | OverlayMask,
    range: readonly [number, number] | undefined,
  ): DecodedHeatmap {
    const key =
      typeof source === "string" ? heatmapIndexKey(source, range) : null;
    const warmed = key === null ? undefined : heatmapIndexCache.get(key);

    if (warmed) {
      return warmed;
    }

    const decoded = decodeHeatmapIndices(source, range);

    if (key !== null) {
      heatmapIndexCache.set(key, decoded);
    }

    return decoded;
  }

  /**
   * Quantize the map and table the palette if either changed since the last
   * paint; otherwise hand back what is already there. The two are cached
   * independently: a new frame under the same palette keeps the table, and a
   * color-scheme change that leaves the range alone keeps the indices.
   */
  private ensureIndexed(palette: HeatmapPalette): IndexedImage | undefined {
    const source = this.resolveSource();

    if (!source) {
      // Nothing resolvable right now: no inline map, and either no `map_path`
      // at all or one still decoding. Stopping at the paint is not enough —
      // the values behind the last paint are what `valueAt` and
      // `containsPoint` answer from, so leaving them would let an invisible
      // overlay go on swallowing clicks for a heatmap that is not on screen.
      // Clearing keeps the hit test honest about what is actually painted; a
      // path decode that lands repaints and repopulates it.
      this.clearRaster();
      return undefined;
    }

    const key = heatmapPaletteKey(palette);

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

    const rangeKey = JSON.stringify(palette.range ?? null);

    try {
      const decoded =
        sameSource && this.#decoded && this.#decodedRange === rangeKey
          ? this.#decoded
          : this.decodeIndices(source, palette.range);

      // The table depends on the range the indices were quantized over,
      // which an undeclared range infers from the array's type — so two maps
      // under one palette can still need two tables.
      const lutKey = `${key}|${decoded.range[0]},${decoded.range[1]}`;
      const lut =
        previous !== undefined && this.#lutKey === lutKey
          ? previous.lut
          : buildHeatmapLut(decoded.range, palette);

      this.#decoded = decoded;
      this.#decodedRange = rangeKey;
      this.#indexed = {
        indices: decoded.indices,
        width: decoded.width,
        height: decoded.height,
        lut,
      };
      this.#lutKey = lutKey;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedSource = undefined;
      this.#failedPalette = undefined;
    } catch (error) {
      // one malformed map must not take the whole frame down
      console.error(`[heatmap] failed to decode "${this.field}":`, error);
      this.#indexed = undefined;
      this.#decoded = undefined;
      this.#decodedRange = undefined;
      this.#lutKey = undefined;
      this.#renderedSource = source;
      this.#renderedPalette = key;
      this.#failedSource = source;
      this.#failedPalette = key;
    }

    return this.#indexed;
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
    // Normalized rather than read straight off the label: `/frames` sends a
    // base64 string, but the GraphQL sample payload sends the same map as
    // `{ $binary: { base64 } }`, and this surface receives both. An unwrapped
    // `$binary` is truthy, so it would reach the rasterizer as an object with
    // no `channels` and fail there instead of painting.
    const inline = maskSourceOf(this.label?.map);

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

  /** The value under a canvas pixel point, or 0 outside the map. */
  valueAtPixel(point: Point): number {
    const relative = toRelativePoint(point, this.#mediaBounds);

    return relative ? this.valueAt(relative) : 0;
  }

  /** The value under a relative point, or 0 outside the map. */
  valueAt(relative: Point): number {
    const decoded = this.#decoded;

    if (!decoded) {
      return 0;
    }

    const { width, height, values, channels } = decoded;
    const x = Math.floor(relative.x * width);
    const y = Math.floor(relative.y * height);

    if (x < 0 || y < 0 || x >= width || y >= height) {
      return 0;
    }

    return values[(y * width + x) * channels];
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
   * What the modal tooltip shows for the pixel under the cursor: its value,
   * bordered in the field's color. The map bytes are dropped from the label
   * copy — the tooltip never shows them, and a base64 map per hover-move is a
   * lot of state to churn for nothing.
   */
  getTooltipInfo(): {
    color: string;
    field: string;
    label: HeatmapLabel;
    type: string;
    target: number;
  } | null {
    const palette = this.currentStyle?.heatmapPalette;

    if (!palette) {
      return null;
    }

    return {
      color: palette.fieldColor,
      field: this.field || "unknown",
      label: { ...this.label, map: undefined },
      type: "Heatmap",
      target: this.#hoverPoint ? this.valueAtPixel(this.#hoverPoint) : 0,
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
    return LABEL_ARCHETYPE_PRIORITY.HEATMAP;
  }

  /** Drops the quantized map and everything hit-testing answers from. */
  private clearRaster(): void {
    this.#indexed = undefined;
    this.#decoded = undefined;
    this.#decodedRange = undefined;
    this.#lutKey = undefined;
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
