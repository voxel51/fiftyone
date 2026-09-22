/**
 * Crops the hover card's image to a patch's bounding box.
 *
 * A patches run's points are labels, not samples, so the card must show
 * the patch rather than its parent image. The card is a fixed-size frame,
 * so the patch is FIT inside it at its true aspect ratio (letterboxed
 * against the card's surface) rather than filling it — the whole patch is
 * always visible and never distorted, at the cost of empty space around
 * oddly-shaped patches.
 *
 * The grid instead sizes each tile to the patch (`zoomAspectRatio` in
 * `@fiftyone/looker`), which it can do because tiles are free to change
 * shape; a hover card is not.
 *
 * The crop itself is an SVG `viewBox`. "Map this rectangle of image space
 * onto this viewport, fit and centered" is precisely what a viewBox is,
 * so the browser does the fitting and the centering. The CSS box model
 * has no such primitive — expressing this with an `<img>` means scaling
 * it up and sliding it around, which is scale and offset arithmetic plus
 * a fight over which percentage resolves against which box. All that is
 * left here is the zoom floor, which is a product rule, not layout.
 */

/**
 * Smallest source-pixel extent the crop will zoom to, mirroring the
 * looker's `MIN_PIXELS` (`@fiftyone/looker/src/constants.ts`) and the
 * clamp in its `adjustBox`. Without it a degenerate box magnifies a
 * handful of pixels into mush; with it, a tiny patch shows its
 * surroundings — the same thing the grid does.
 *
 * Duplicated rather than imported: embeddings-v2 does not depend on
 * `@fiftyone/looker`, and one constant does not justify the edge.
 */
const MIN_PIXELS = 16;

/** Relative [x, y, w, h] within the media */
export type Bounds = readonly [number, number, number, number];

/** The patch's rectangle in source pixels: [x, y, w, h] */
export type PatchRect = [number, number, number, number];

const isFinitePositive = (value: number) => Number.isFinite(value) && value > 0;

/**
 * The patch's rectangle in source pixels, with the zoom floor applied.
 *
 * Null when the geometry cannot produce a crop, in which case the caller
 * shows the untouched image.
 */
export function patchRect(
  bounds: Bounds,
  mediaWidth: number,
  mediaHeight: number,
): PatchRect | null {
  if (!isFinitePositive(mediaWidth) || !isFinitePositive(mediaHeight)) {
    return null;
  }

  const [originX, originY, originWidth, originHeight] = bounds;
  if (
    !bounds.every((coord) => Number.isFinite(coord)) ||
    !isFinitePositive(originWidth) ||
    !isFinitePositive(originHeight)
  ) {
    return null;
  }

  // Work in source pixels: the viewBox is in that space, and so is the
  // floor
  let width = originWidth * mediaWidth;
  let height = originHeight * mediaHeight;
  const centerX = originX * mediaWidth + width / 2;
  const centerY = originY * mediaHeight + height / 2;

  // Widen a sub-MIN_PIXELS box about its center, preserving its aspect --
  // the looker's adjustBox, which recenters from the original box both
  // times so the two clamps cannot drift the patch off center
  const aspect = width / height;

  if (width < MIN_PIXELS) {
    width = MIN_PIXELS;
    height = width / aspect;
  }

  if (height < MIN_PIXELS) {
    height = MIN_PIXELS;
    width = height * aspect;
  }

  return [centerX - width / 2, centerY - height / 2, width, height];
}
