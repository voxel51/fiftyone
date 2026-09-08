/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Dimensions, Rect } from "@fiftyone/lighter";

/**
 * Converts normalized [0,1] bounding box coordinates to pixel coordinates
 * relative to the original image dimensions.
 *
 * This is the correct coordinate space for display in the sidebar — values
 * match what a user would see if they inspected the actual image file.
 */
export function relativeToImagePixels(
  relative: Rect,
  originalDimensions: Dimensions,
): Rect {
  return {
    x: relative.x * originalDimensions.width,
    y: relative.y * originalDimensions.height,
    width: relative.width * originalDimensions.width,
    height: relative.height * originalDimensions.height,
  };
}

/**
 * Converts image-pixel coordinates back to canvas pixel coordinates.
 *
 * The canvas renders the image at `renderedBounds` size (letterboxed/pillarboxed
 * inside the container). To position an overlay on the canvas we need canvas
 * pixels, not image pixels.
 */
export function imagePixelsToCanvasPixels(
  imageRect: Rect,
  originalDimensions: Dimensions,
  renderedBounds: Rect,
): Rect {
  return {
    x:
      renderedBounds.x +
      (imageRect.x / originalDimensions.width) * renderedBounds.width,
    y:
      renderedBounds.y +
      (imageRect.y / originalDimensions.height) * renderedBounds.height,
    width: (imageRect.width / originalDimensions.width) * renderedBounds.width,
    height:
      (imageRect.height / originalDimensions.height) * renderedBounds.height,
  };
}
