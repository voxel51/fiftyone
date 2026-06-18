import { describe, expect, it } from "vitest";

import {
  clampImageViewTransform,
  imageDisplayRect,
  transformedImageDisplayRect,
} from "./base-2d-scene";

describe("2D image view helpers", () => {
  it("computes contain-mode display rects", () => {
    expect(
      imageDisplayRect(
        { height: 300, width: 400 },
        { height: 100, width: 200 },
        "contain"
      )
    ).toEqual({ height: 200, width: 400, x: 0, y: 50 });
  });

  it("applies zoom around the display rect center plus translation", () => {
    expect(
      transformedImageDisplayRect(
        { height: 200, width: 400, x: 0, y: 50 },
        { scale: 2, translateX: 25, translateY: -10 }
      )
    ).toEqual({ height: 400, width: 800, x: -175, y: -60 });
  });

  it("clamps panning to the scaled image bounds", () => {
    expect(
      clampImageViewTransform(
        { scale: 2, translateX: 1000, translateY: -1000 },
        {
          containerSize: { height: 300, width: 400 },
          fit: "contain",
          imageSize: { height: 100, width: 200 },
        }
      )
    ).toEqual({ scale: 2, translateX: 200, translateY: -50 });
  });

  it("allows callers to set a minimum scale below the fitted view", () => {
    expect(
      clampImageViewTransform(
        { scale: 0.5, translateX: 1000, translateY: -1000 },
        {
          containerSize: { height: 300, width: 400 },
          fit: "contain",
          imageSize: { height: 100, width: 200 },
          minScale: 0.1,
        }
      )
    ).toEqual({ scale: 0.5, translateX: 100, translateY: -100 });
  });

  it("keeps contain-mode letterbox pan locked at the fitted scale", () => {
    expect(
      clampImageViewTransform(
        { scale: 1, translateX: 1000, translateY: -1000 },
        {
          containerSize: { height: 300, width: 400 },
          fit: "contain",
          imageSize: { height: 100, width: 200 },
          minScale: 0.1,
        }
      )
    ).toEqual({ scale: 1, translateX: 0, translateY: 0 });
  });

  it("allows cover-mode panning at the fitted scale", () => {
    expect(
      clampImageViewTransform(
        { scale: 1, translateX: 1000, translateY: 0 },
        {
          containerSize: { height: 300, width: 400 },
          fit: "cover",
          imageSize: { height: 100, width: 200 },
        }
      )
    ).toEqual({ scale: 1, translateX: 100, translateY: 0 });
  });

  it("allows zoomed-out cover-mode panning while an axis remains cropped", () => {
    expect(
      clampImageViewTransform(
        { scale: 0.8, translateX: 1000, translateY: -1000 },
        {
          containerSize: { height: 300, width: 400 },
          fit: "cover",
          imageSize: { height: 100, width: 200 },
          minScale: 0.1,
        }
      )
    ).toEqual({ scale: 0.8, translateX: 40, translateY: -30 });
  });
});
