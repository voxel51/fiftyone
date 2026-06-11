/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import {
  dimensionsAreSwapped,
  getImageOverlayDimensions,
} from "./imageDimensions";

describe("image overlay dimensions", () => {
  it("detects dimensions swapped by EXIF orientation metadata", () => {
    expect(
      dimensionsAreSwapped(
        { width: 4080, height: 3060 },
        { width: 3060, height: 4080 },
      ),
    ).toBe(true);
  });

  it("uses metadata dimensions when the browser reports unrotated intrinsic dimensions", () => {
    const image = {
      naturalWidth: 4080,
      naturalHeight: 3060,
      width: 4080,
      height: 3060,
    } as HTMLImageElement;

    expect(
      getImageOverlayDimensions(image, { width: 3060, height: 4080 }),
    ).toEqual({ width: 3060, height: 4080 });
  });

  it("keeps intrinsic dimensions when metadata is not a swapped pair", () => {
    const image = {
      naturalWidth: 800,
      naturalHeight: 600,
      width: 800,
      height: 600,
    } as HTMLImageElement;

    expect(
      getImageOverlayDimensions(image, { width: 1024, height: 768 }),
    ).toEqual({ width: 800, height: 600 });
  });
});
