// Fixed input resolution for the SAM2 encoder (model constraint).
export const SAM2_INPUT_SIZE = 1024;

// Fixed output mask resolution from the SAM2 decoder (model constraint).
export const SAM2_OUTPUT_SIZE = 256;

// Geometric metadata from preprocessing (shared by encoder, decoder, and cache).
// SAM2's reference preprocessing is a direct (non-aspect-preserving) resize to
// SAM2_INPUT_SIZE x SAM2_INPUT_SIZE.
export interface ImageGeometry {
  originalWidth: number;
  originalHeight: number;
}

export interface ProcessedImage extends ImageGeometry {
  tensor: Float32Array;
}

/**
 * Map normalized [0,1] coordinates to the SAM2_INPUT_SIZE x SAM2_INPUT_SIZE
 * encoder input space. Since the image is stretched to fill the full input,
 * normalized coords map straight to [0, SAM2_INPUT_SIZE] on each axis.
 *
 * @param x Normalized x coordinate in [0,1]
 * @param y Normalized y coordinate in [0,1]
 * @returns Pixel coordinates in encoder input space
 */
export function transformPoint(x: number, y: number): [number, number] {
  return [x * SAM2_INPUT_SIZE, y * SAM2_INPUT_SIZE];
}

/**
 * Map a pixel-space bounding box to normalized [0,1] coordinates.
 *
 * @param bbox Bounding box in pixel coordinates
 * @param img The preprocessing metadata (for original dimensions)
 * @returns Bounding box in [0,1] normalized coordinates
 */
export function normalizeBbox(
  bbox: { x: number; y: number; w: number; h: number },
  img: ImageGeometry,
): { x: number; y: number; w: number; h: number } {
  return {
    x: bbox.x / img.originalWidth,
    y: bbox.y / img.originalHeight,
    w: bbox.w / img.originalWidth,
    h: bbox.h / img.originalHeight,
  };
}

/**
 * Find the tight bounding box of positive logits (> 0, i.e. sigmoid > 0.5) in
 * the decoder's low-resolution mask, then map it to original image coordinates.
 *
 * @param maskData Raw logit values from the decoder (maskH x maskW)
 * @param img The preprocessing metadata (used to reverse scale/padding)
 * @param maskH Height of the decoder output mask
 * @param maskW Width of the decoder output mask
 * @returns Bounding box in original image pixels, or null if mask is empty
 */
export function computeMaskBbox(
  maskData: Float32Array,
  img: ImageGeometry,
  maskH = SAM2_OUTPUT_SIZE,
  maskW = SAM2_OUTPUT_SIZE,
): { x: number; y: number; w: number; h: number } | null {
  const { originalWidth: W, originalHeight: H } = img;
  // The image fills the full mask (SAM2 stretches to 1024x1024), so the
  // mask-space coords map directly to normalized [0,1] image coords.

  // Find exact bbox of positive logits in mask space
  let mx0 = maskW,
    my0 = maskH,
    mx1 = -1,
    my1 = -1;
  for (let y = 0; y < maskH; y++) {
    for (let x = 0; x < maskW; x++) {
      if (maskData[y * maskW + x] > 0) {
        if (x < mx0) mx0 = x;
        if (x > mx1) mx1 = x;
        if (y < my0) my0 = y;
        if (y > my1) my1 = y;
      }
    }
  }

  if (mx1 < 0) return null;

  // Map mask-space bbox to original image coordinates
  const x1 = Math.max(0, Math.floor((mx0 / maskW) * W));
  const y1 = Math.max(0, Math.floor((my0 / maskH) * H));
  const x2 = Math.min(W - 1, Math.ceil((mx1 / maskW) * W));
  const y2 = Math.min(H - 1, Math.ceil((my1 / maskH) * H));

  return { x: x1, y: y1, w: x2 - x1 + 1, h: y2 - y1 + 1 };
}

/**
 * Bilinearly upsample the decoder's logit mask within a bounding box region,
 * then apply sigmoid to clamp values to [0,1]. Only the bbox region is
 * computed, avoiding unnecessary work on empty areas.
 *
 * @param maskData Raw logit values from the decoder (maskH x maskW)
 * @param img The preprocessing metadata (used to reverse scale/padding)
 * @param bbox Bounding box in original image pixels to upsample within
 * @param maskH Height of the decoder output mask
 * @param maskW Width of the decoder output mask
 * @returns Float32Array of size bbox.w * bbox.h with values in [0,1]
 */
export function postprocessMask(
  maskData: Float32Array,
  img: ImageGeometry,
  bbox: { x: number; y: number; w: number; h: number },
  maskH = SAM2_OUTPUT_SIZE,
  maskW = SAM2_OUTPUT_SIZE,
): Float32Array {
  const { originalWidth: W, originalHeight: H } = img;
  // The image fills the full mask: map image-space (ox, oy) directly to
  // mask coords (ox/W * maskW, oy/H * maskH).
  const out = new Float32Array(bbox.w * bbox.h);

  for (let iy = 0; iy < bbox.h; iy++) {
    for (let ix = 0; ix < bbox.w; ix++) {
      const ox = bbox.x + ix;
      const oy = bbox.y + iy;
      const mx = (ox / W) * maskW;
      const my = (oy / H) * maskH;
      const x0 = Math.max(0, Math.min(Math.floor(mx), maskW - 1));
      const x1 = Math.min(x0 + 1, maskW - 1);
      const y0 = Math.max(0, Math.min(Math.floor(my), maskH - 1));
      const y1 = Math.min(y0 + 1, maskH - 1);
      const xf = mx - Math.floor(mx);
      const yf = my - Math.floor(my);

      const val =
        maskData[y0 * maskW + x0] * (1 - xf) * (1 - yf) +
        maskData[y0 * maskW + x1] * xf * (1 - yf) +
        maskData[y1 * maskW + x0] * (1 - xf) * yf +
        maskData[y1 * maskW + x1] * xf * yf;

      out[iy * bbox.w + ix] = 1 / (1 + Math.exp(-val));
    }
  }

  return out;
}
