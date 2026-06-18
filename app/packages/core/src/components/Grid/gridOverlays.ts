/**
 * Lightweight per-tile overlay renderer for the infinite grid.
 *
 * Draws bounding boxes + segmentation/instance masks + classification "chips" for a
 * sample onto a cheap 2D canvas layered over the tile's <img>. Deliberately NOT a
 * looker: a full looker per tile floods the label-rendering worker (later tiles
 * stall) and repaints the image (flash). This reads straight from the INLINE sample
 * doc and never fetches or touches a worker.
 *
 * Colors reuse `getColor(pool, seed, fieldPath)` — the same color-by-field result
 * the sidebar swatch + looker use (the common COLOR_BY.FIELD case). Masks reuse the
 * looker's `deserialize` (gzip+numpy) and are decode-cached, so a given mask inflates
 * at most once.
 */

import { ARRAY_TYPES, deserialize } from "@fiftyone/looker";
import { getColor } from "@fiftyone/utilities";
import { get } from "lodash";

const STROKE_WIDTH = 2;
const MASK_ALPHA = 0.45;
const CHIP_FONT = "12px sans-serif";
const CHIP_H = 16;
const CHIP_PAD_X = 5;
const CHIP_GAP = 3;
// cap the decoded-mask cache so a long scroll can't grow it unbounded.
const MAX_MASK_CACHE = 1000;

export interface Coloring {
  pool: readonly string[];
  seed: number;
}

interface DecodedMask {
  arr: ArrayLike<number>;
  w: number;
  h: number;
  channels: number;
}

// decode-cache: a mask base64 inflates at most once (decode is gzip+numpy).
const maskCache = new Map<string, DecodedMask | null>();

const decodeMask = (b64: string): DecodedMask | null => {
  const cached = maskCache.get(b64);
  if (cached !== undefined) return cached;
  let decoded: DecodedMask | null = null;
  try {
    const m = deserialize(b64);
    const Ctor = ARRAY_TYPES[m.arrayType] as {
      new (b: ArrayBuffer): ArrayLike<number>;
    };
    decoded = {
      arr: new Ctor(m.buffer),
      w: m.shape[1],
      h: m.shape[0],
      channels: m.channels || 1,
    };
  } catch (e) {
    console.error("[grid-overlays] mask decode failed", e);
  }
  if (maskCache.size >= MAX_MASK_CACHE) {
    const oldest = maskCache.keys().next().value;
    if (oldest !== undefined) maskCache.delete(oldest);
  }
  maskCache.set(b64, decoded);
  return decoded;
};

// a label's inline mask payload (base64), or undefined for box-only / on-disk masks.
const extractMask = (label: { mask?: unknown }): string | undefined => {
  const m = label?.mask;
  if (typeof m === "string") return m;
  const b = (m as { $binary?: { base64?: string } } | undefined)?.$binary
    ?.base64;
  return typeof b === "string" ? b : undefined;
};

const parseHex = (hex: string): [number, number, number] => {
  const h = hex.startsWith("#") ? hex.slice(1) : hex;
  if (h.length >= 6) {
    return [
      parseInt(h.slice(0, 2), 16),
      parseInt(h.slice(2, 4), 16),
      parseInt(h.slice(4, 6), 16),
    ];
  }
  return [255, 0, 0];
};

// "#rrggbb" → readable text color (black on light, white on dark).
const textOn = (hex: string): string => {
  const [r, g, b] = parseHex(hex);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#000" : "#fff";
};

// paint a mask's nonzero pixels in `color` into the [x,y,w,h] rect (scaled).
const paintMask = (
  ctx: CanvasRenderingContext2D,
  b64: string,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string
): void => {
  const d = decodeMask(b64);
  if (!d || !d.w || !d.h) return;
  const { arr, w: mw, h: mh, channels } = d;
  const [r, g, b] = parseHex(color);
  const rgba = new Uint8ClampedArray(mw * mh * 4);
  const a = Math.round(MASK_ALPHA * 255);
  for (let i = 0; i < mw * mh; i++) {
    if (arr[i * channels]) {
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = a;
    }
  }
  const off = document.createElement("canvas");
  off.width = mw;
  off.height = mh;
  off.getContext("2d")?.putImageData(new ImageData(rgba, mw, mh), 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, x, y, w, h);
};

/**
 * Draw a sample's active boxes, masks, and classification chips onto `canvas`,
 * sized to `[width, height]` and contain-fit to the media's aspect ratio so overlays
 * align with the (object-fit: contain) <img>.
 */
export function drawOverlays(
  canvas: HTMLCanvasElement,
  sample: Record<string, unknown>,
  activePaths: ReadonlyArray<string>,
  coloring: Coloring,
  width: number,
  height: number,
  // the media's aspect ratio (w/h). Prefer the rendered <img>'s NATURAL dims (the
  // exact source `object-fit: contain` uses) so overlays align at any tile AR; falls
  // back to stored metadata, then to the tile.
  mediaAspect?: number
): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);
  const ctx = canvas.getContext("2d");
  if (!ctx || !width || !height) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  // contain-fit content rect from the media aspect ratio (same as the <img>).
  const md = sample.metadata as { width?: number; height?: number } | undefined;
  const mediaAR =
    mediaAspect && mediaAspect > 0
      ? mediaAspect
      : md?.width && md?.height
      ? md.width / md.height
      : width / height;
  let cw = width;
  let ch = height;
  let ox = 0;
  let oy = 0;
  if (mediaAR > width / height) {
    ch = width / mediaAR;
    oy = (height - ch) / 2;
  } else {
    cw = height * mediaAR;
    ox = (width - cw) / 2;
  }

  const chips: { text: string; color: string }[] = [];

  for (const path of activePaths) {
    const value = get(sample, path) as
      | Record<string, unknown>
      | unknown[]
      | undefined;
    if (!value) continue;
    // color by the FIELD (first path segment) — matches the sidebar swatch.
    const color = getColor(coloring.pool, coloring.seed, path.split(".")[0]);

    // normalize the field value (a label, a label container, or an expanded list).
    let dets: Array<{ bounding_box?: number[]; mask?: unknown }> | undefined;
    let clss: Array<{ label?: unknown }> | undefined;
    let seg: { mask?: unknown } | undefined;
    const cls = (value as { _cls?: string })._cls;
    if (cls === "Detections")
      dets = (value as { detections?: typeof dets }).detections;
    else if (cls === "Detection") dets = [value as { bounding_box?: number[] }];
    else if (cls === "Segmentation" || cls === "Heatmap")
      seg = value as { mask?: unknown };
    else if (cls === "Classifications")
      clss = (value as { classifications?: typeof clss }).classifications;
    else if (cls === "Classification") clss = [value as { label?: unknown }];
    else if (Array.isArray(value) && value.length) {
      const k = (value[0] as { _cls?: string })?._cls;
      if (k === "Detection") dets = value as typeof dets;
      else if (k === "Classification") clss = value as typeof clss;
    }

    // full-image masks (segmentation/heatmap) over the content rect.
    if (seg) {
      const mb = extractMask(seg);
      if (mb) paintMask(ctx, mb, ox, oy, cw, ch, color);
    }

    // detections: mask (within the box) UNDER the box outline.
    for (const d of dets ?? []) {
      const bb = d?.bounding_box;
      if (!bb || bb.length < 4) continue;
      const x = ox + bb[0] * cw;
      const y = oy + bb[1] * ch;
      const w = bb[2] * cw;
      const h = bb[3] * ch;
      const mb = extractMask(d);
      if (mb) paintMask(ctx, mb, x, y, w, h, color);
      ctx.strokeStyle = color;
      ctx.lineWidth = STROKE_WIDTH;
      ctx.strokeRect(x, y, w, h);
    }

    for (const c of clss ?? []) {
      if (c?.label != null) chips.push({ text: String(c.label), color });
    }
  }

  // chips along the bottom of the content rect, left-aligned, wrapping upward.
  if (chips.length) {
    ctx.font = CHIP_FONT;
    ctx.textBaseline = "middle";
    let cx = ox;
    let cy = oy + ch - CHIP_H;
    for (const chip of chips) {
      const w = ctx.measureText(chip.text).width + CHIP_PAD_X * 2;
      if (cx + w > ox + cw && cx > ox) {
        cx = ox;
        cy -= CHIP_H + CHIP_GAP;
      }
      ctx.fillStyle = chip.color;
      ctx.fillRect(cx, cy, w, CHIP_H);
      ctx.fillStyle = textOn(chip.color);
      ctx.fillText(chip.text, cx + CHIP_PAD_X, cy + CHIP_H / 2);
      cx += w + CHIP_GAP;
    }
  }
}
