import { describe, expect, it } from "vitest";
import { patchRect, type Bounds } from "./patchCrop";

const MEDIA_W = 600;
const MEDIA_H = 400;

const rect = (bounds: Bounds, width = MEDIA_W, height = MEDIA_H) => {
  const result = patchRect(bounds, width, height);
  if (!result) throw new Error("expected a rect");
  return result;
};

describe("patchRect", () => {
  it("converts relative bounds to source pixels", () => {
    // The viewBox lives in the image's pixel space, not the frame's
    expect(rect([0.1, 0.2, 0.5, 0.25])).toEqual([60, 80, 300, 100]);
  });

  it("passes a box that overhangs the media through unclamped", () => {
    // Labels may extend past the edge; the crop handles it the same way
    // the grid's crop-to-content does
    expect(rect([-0.1, 0.4, 0.4, 0.2])).toEqual([-60, 160, 240, 80]);
  });

  it("stops zooming a sub-16px box, keeping it centered", () => {
    // 0.02 x 0.02 of 600x400 is 12x8 -- under the floor on both axes, so
    // the rect widens to show the patch's surroundings instead of
    // magnifying a handful of pixels
    const [x, y, width, height] = rect([0.48, 0.48, 0.02, 0.02]);

    expect(width).toBeCloseTo(24);
    expect(height).toBeCloseTo(16);
    // Same center as the original box: 0.48 * 600 + 6, 0.48 * 400 + 4
    expect(x + width / 2).toBeCloseTo(294);
    expect(y + height / 2).toBeCloseTo(196);
  });

  it("applies the floor per axis, preserving the box's aspect", () => {
    // Thin but tall: only the width is under the floor, and correcting it
    // must not change the patch's shape
    const [, , width, height] = rect([0.5, 0.2, 0.01, 0.6]);

    expect(width).toBeCloseTo(16);
    // 6 x 240 in pixels, so 0.025 -- unchanged by the floor
    expect(width / height).toBeCloseTo((0.01 * MEDIA_W) / (0.6 * MEDIA_H));
  });

  it("leaves a box already above the floor alone", () => {
    expect(rect([0, 0, 16 / MEDIA_W, 16 / MEDIA_H])).toEqual([0, 0, 16, 16]);
  });

  it("declines geometry it cannot crop with", () => {
    expect(patchRect([0, 0, 0, 0.5], MEDIA_W, MEDIA_H)).toBeNull();
    expect(patchRect([0, 0, 0.5, 0], MEDIA_W, MEDIA_H)).toBeNull();
    expect(patchRect([Number.NaN, 0, 0.5, 0.5], MEDIA_W, MEDIA_H)).toBeNull();
    // Natural size is unknown until the image loads
    expect(patchRect([0, 0, 0.5, 0.5], 0, 0)).toBeNull();
  });
});
