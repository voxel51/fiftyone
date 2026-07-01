import { describe, expect, it } from "vitest";

import { nextImageViewTransformForWheel } from "./use-image-pan-zoom";

describe("nextImageViewTransformForWheel", () => {
  it("zooms in for negative wheel deltas", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1, translateX: 0, translateY: 0 },
        -100,
        { x: 0, y: 0 },
      ),
    ).toEqual({ scale: 1.045, translateX: 0, translateY: 0 });
  });

  it("zooms out for positive wheel deltas", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1.045, translateX: 0, translateY: 0 },
        100,
        { x: 0, y: 0 },
      ),
    ).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("zooms out from the default fitted scale", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1, translateX: 0, translateY: 0 },
        100,
        { x: 0, y: 0 },
      ),
    ).toEqual({ scale: 1 / 1.045, translateX: 0, translateY: 0 });
  });

  it("keeps the cursor anchored while zooming in", () => {
    expect(
      nextImageViewTransformForWheel(
        { scale: 1, translateX: 0, translateY: 0 },
        -100,
        { x: 80, y: -40 },
      ),
    ).toEqual({
      scale: 1.045,
      translateX: 80 - 80 * 1.045,
      translateY: -40 - -40 * 1.045,
    });
  });

  it("keeps the pointer anchored while zooming out", () => {
    const next = nextImageViewTransformForWheel(
      { scale: 2, translateX: 40, translateY: -20 },
      100,
      { x: 100, y: 50 },
    );

    expect(next.scale).toBeCloseTo(2 / 1.045);
    expect(next.translateX).toBeCloseTo(100 - (100 - 40) / 1.045);
    expect(next.translateY).toBeCloseTo(50 - (50 + 20) / 1.045);
  });
});
