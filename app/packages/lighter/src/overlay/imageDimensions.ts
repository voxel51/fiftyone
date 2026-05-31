/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import type { Dimensions } from "../types";

export const getIntrinsicImageDimensions = (
  image: HTMLImageElement,
): Dimensions => ({
  width: image.naturalWidth || image.width,
  height: image.naturalHeight || image.height,
});

export const dimensionsAreSwapped = (a: Dimensions, b: Dimensions): boolean => {
  if (!a.width || !a.height || !b.width || !b.height) {
    return false;
  }

  return a.width === b.height && a.height === b.width;
};

export const getImageOverlayDimensions = (
  image: HTMLImageElement,
  metadataDimensions?: Dimensions,
): Dimensions => {
  const intrinsicDimensions = getIntrinsicImageDimensions(image);

  if (
    metadataDimensions &&
    dimensionsAreSwapped(intrinsicDimensions, metadataDimensions)
  ) {
    return metadataDimensions;
  }

  return intrinsicDimensions;
};
