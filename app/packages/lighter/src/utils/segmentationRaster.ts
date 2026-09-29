/**
 * Copyright 2017-2026, Voxel51, Inc.
 *
 * Pure segmentation decode + paint — no DOM, so it runs identically on the
 * main thread and inside a worker.
 *
 * Unlike `maskRaster`, which produces a color-INDEPENDENT white+alpha buffer
 * for the renderer to GPU-tint, a segmentation's color varies per pixel: each
 * target gets its own. The color therefore has to be baked into the RGBA here,
 * which is why a color-scheme change re-rasterizes rather than re-tinting.
 * That matches looker, whose worker painter does the same.
 */

import {
  ARRAY_TYPES,
  deserialize,
  type OverlayMask,
} from "@fiftyone/looker/src/numpy";

/** Any of the integer arrays a mask's targets can arrive in. */
type TypedTargets =
  | Uint8Array
  | Uint16Array
  | Uint32Array
  | Int8Array
  | Int16Array
  | Int32Array;
import { convertToHex } from "@fiftyone/looker/src/worker/painter";
import { get32BitColor, hexToRgb } from "@fiftyone/utilities";

import {
  colorForTarget,
  type SegmentationPalette,
} from "./segmentationPalette";

export interface RasterizedSegmentation {
  /** Painted RGBA, row-major, `width * height * 4` bytes. */
  rgba: ArrayBuffer;
  width: number;
  height: number;
  /**
   * The per-pixel target index, for hit-testing and the tooltip. Pixels that
   * did not paint read 0, so this doubles as the "is there anything here"
   * channel.
   *
   * Typed to match the SOURCE mask rather than always `Uint8Array`: mask
   * targets are not limited to a byte (a semantic-segmentation model with more
   * than 255 classes is ordinary), and narrowing here would wrap target 300
   * around to 44 — a tooltip naming the wrong class, and a hit test agreeing
   * with it.
   */
  targets: TypedTargets;
}

/** Any CSS color -> packed 32-bit RGBA, memoized per rasterize pass. */
const packer = () => {
  const cache = new Map<string, number>();

  return (color: string): number => {
    const hit = cache.get(color);

    if (hit !== undefined) {
      return hit;
    }

    // A color scheme's colors are not all `#rrggbb`: a mask-target color can
    // be any CSS color the user typed, "yellowgreen" included, and `hexToRgb`
    // reads none of those. The painter normalizes with `convertToHex` for the
    // same reason, so both surfaces agree on what such a target looks like.
    // Opaque white remains the fallback for a color neither can parse —
    // visible and honest, where skipping the pixel would read as a hole in
    // the mask.
    let rgb: ReturnType<typeof hexToRgb> | null = null;

    try {
      rgb = hexToRgb(convertToHex(color));
    } catch {
      rgb = null;
    }

    const packed = get32BitColor(rgb ?? [255, 255, 255]);

    cache.set(color, packed);

    return packed;
  };
};

/** A pixel count has to be a whole positive number small enough to index. */
const isDimension = (value: number): boolean =>
  Number.isSafeInteger(value) && value > 0;

/**
 * Decode (if base64) + paint a single-channel indexed segmentation mask.
 *
 * @param maskData - Base64-encoded compressed numpy string, or a decoded
 *   {@link OverlayMask}.
 * @param palette - Resolved colors; see `resolveSegmentationPalette`.
 * @throws If the mask is not single-channel. RGB mask targets are a separate
 *   looker mode this path does not implement — better to fail loudly than to
 *   paint an RGB mask as though its channels were target indices.
 */
export const rasterizeSegmentation = (
  maskData: string | OverlayMask,
  palette: SegmentationPalette,
): RasterizedSegmentation => {
  const mask = typeof maskData === "string" ? deserialize(maskData) : maskData;

  if (mask.channels !== 1) {
    throw new Error(
      `Expected a single-channel segmentation mask, got ${mask.channels} ` +
        "channels (RGB mask targets are not supported on this surface)",
    );
  }

  const ArrayType = ARRAY_TYPES[mask.arrayType];

  if (!ArrayType) {
    throw new Error(`Unsupported mask array type: ${mask.arrayType}`);
  }

  // `numpy.parse` copies the shape out of the header without checking it, so
  // a malformed mask can arrive claiming [0, 0] or [-1, -1]. The payload
  // check below passes both — a zero-length buffer satisfies zero pixels —
  // and the caller then hands 0x0 to `createMaskCanvas` and `ImageData`,
  // which throw with nothing to say about why. Fail here, where the reason
  // can be named. Looker guards the same case.
  if (mask.shape?.length !== 2) {
    throw new Error(
      `Expected a 2-D segmentation mask shape, got ${JSON.stringify(
        mask.shape,
      )}`,
    );
  }

  const [height, width] = mask.shape;

  if (!isDimension(width) || !isDimension(height)) {
    throw new Error(
      `Invalid segmentation mask dimensions: ${JSON.stringify([
        height,
        width,
      ])}`,
    );
  }

  const pixels = width * height;
  const source = new ArrayType(mask.buffer);

  if (source.length !== pixels) {
    throw new Error(
      `Mask payload length mismatch: expected ${pixels}, got ${source.length}`,
    );
  }

  const rgba = new ArrayBuffer(pixels * 4);
  const overlay = new Uint32Array(rgba);
  // same width as the source, so a target above 255 is reported as itself
  const targets = new ArrayType(pixels) as TypedTargets;
  const pack = packer();

  // Colors repeat heavily across a mask — a few targets over millions of
  // pixels — so resolve each target once rather than per pixel.
  const packedByTarget = new Map<number, number | undefined>();

  for (let i = 0; i < pixels; i++) {
    const target = source[i];

    if (!target) {
      continue;
    }

    let packed = packedByTarget.get(target);

    if (packed === undefined && !packedByTarget.has(target)) {
      const color = colorForTarget(target, palette);
      packed = color === undefined ? undefined : pack(color);
      packedByTarget.set(target, packed);
    }

    if (packed === undefined) {
      // filtered out by mask targets: leave transparent AND leave the target
      // channel 0, so hit-testing agrees with what is visible
      continue;
    }

    overlay[i] = packed;
    targets[i] = target;
  }

  return { rgba, width, height, targets };
};
