/**
 * Copyright 2017-2026, Voxel51, Inc.
 */

import { describe, expect, it } from "vitest";
import {
  imagePixelsToCanvasPixels,
  relativeToImagePixels,
} from "./coordinateConversion";

describe("relativeToImagePixels", () => {
  it("converts normalized coords to image pixel coords", () => {
    const result = relativeToImagePixels(
      { x: 0.1, y: 0.2, width: 0.5, height: 0.4 },
      { width: 1920, height: 1080 }
    );

    expect(result.x).toBeCloseTo(192);
    expect(result.y).toBeCloseTo(216);
    expect(result.width).toBeCloseTo(960);
    expect(result.height).toBeCloseTo(432);
  });

  it("maps (0, 0) origin to image top-left", () => {
    const result = relativeToImagePixels(
      { x: 0, y: 0, width: 1, height: 1 },
      { width: 800, height: 600 }
    );

    expect(result.x).toBe(0);
    expect(result.y).toBe(0);
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it("supports negative x/y for boxes that extend beyond the image edge", () => {
    const result = relativeToImagePixels(
      { x: -0.1, y: 0, width: 0.5, height: 0.5 },
      { width: 1000, height: 1000 }
    );

    expect(result.x).toBeCloseTo(-100);
    expect(result.y).toBe(0);
  });

  it("supports width/height > 1 for boxes that extend beyond the image edge", () => {
    const result = relativeToImagePixels(
      { x: 0, y: 0, width: 1.2, height: 1.1 },
      { width: 500, height: 400 }
    );

    expect(result.width).toBeCloseTo(600);
    expect(result.height).toBeCloseTo(440);
  });

  it("uses image width for x/width and image height for y/height independently", () => {
    // Non-square image: 2000 wide, 500 tall
    const result = relativeToImagePixels(
      { x: 0.5, y: 0.5, width: 0.5, height: 0.5 },
      { width: 2000, height: 500 }
    );

    expect(result.x).toBeCloseTo(1000);
    expect(result.y).toBeCloseTo(250);
    expect(result.width).toBeCloseTo(1000);
    expect(result.height).toBeCloseTo(250);
  });
});

describe("imagePixelsToCanvasPixels", () => {
  it("converts image pixel coords to canvas pixel coords when canvas matches image size", () => {
    // When rendered size == original size, image pixels === canvas pixels
    const dims = { width: 800, height: 600 };
    const rendered = { x: 0, y: 0, width: 800, height: 600 };

    const result = imagePixelsToCanvasPixels(
      { x: 100, y: 50, width: 200, height: 150 },
      dims,
      rendered
    );

    expect(result.x).toBeCloseTo(100);
    expect(result.y).toBeCloseTo(50);
    expect(result.width).toBeCloseTo(200);
    expect(result.height).toBeCloseTo(150);
  });

  it("scales down when image is rendered smaller than its original size", () => {
    // 1920x1080 image rendered at 960x540 (half size, no letterboxing)
    const dims = { width: 1920, height: 1080 };
    const rendered = { x: 0, y: 0, width: 960, height: 540 };

    const result = imagePixelsToCanvasPixels(
      { x: 480, y: 270, width: 960, height: 540 },
      dims,
      rendered
    );

    expect(result.x).toBeCloseTo(240);
    expect(result.y).toBeCloseTo(135);
    expect(result.width).toBeCloseTo(480);
    expect(result.height).toBeCloseTo(270);
  });

  it("accounts for canvas offset when image is letterboxed", () => {
    // 800x400 image (2:1 aspect) rendered letterboxed inside an 800x600 canvas.
    // Rendered area: x=0, y=100, width=800, height=400
    const dims = { width: 800, height: 400 };
    const rendered = { x: 0, y: 100, width: 800, height: 400 };

    const result = imagePixelsToCanvasPixels(
      { x: 0, y: 0, width: 800, height: 400 },
      dims,
      rendered
    );

    expect(result.x).toBeCloseTo(0);
    expect(result.y).toBeCloseTo(100); // offset from letterbox
    expect(result.width).toBeCloseTo(800);
    expect(result.height).toBeCloseTo(400);
  });

  it("accounts for canvas offset when image is pillarboxed", () => {
    // 400x600 image (2:3 aspect) rendered pillarboxed inside an 800x600 canvas.
    // Rendered area: x=200, y=0, width=400, height=600
    const dims = { width: 400, height: 600 };
    const rendered = { x: 200, y: 0, width: 400, height: 600 };

    const result = imagePixelsToCanvasPixels(
      { x: 0, y: 0, width: 400, height: 600 },
      dims,
      rendered
    );

    expect(result.x).toBeCloseTo(200); // offset from pillarbox
    expect(result.y).toBeCloseTo(0);
    expect(result.width).toBeCloseTo(400);
    expect(result.height).toBeCloseTo(600);
  });

  it("is the inverse of relativeToImagePixels", () => {
    const dims = { width: 1920, height: 1080 };
    const rendered = { x: 50, y: 30, width: 960, height: 540 };
    const relative = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };

    // relative → image pixels → canvas pixels should equal relativeToAbsolute
    const imagePixels = relativeToImagePixels(relative, dims);
    const canvasPixels = imagePixelsToCanvasPixels(imagePixels, dims, rendered);

    // Manually compute expected canvas pixels from relative coords
    const expectedX = rendered.x + relative.x * rendered.width;
    const expectedY = rendered.y + relative.y * rendered.height;
    const expectedW = relative.width * rendered.width;
    const expectedH = relative.height * rendered.height;

    expect(canvasPixels.x).toBeCloseTo(expectedX);
    expect(canvasPixels.y).toBeCloseTo(expectedY);
    expect(canvasPixels.width).toBeCloseTo(expectedW);
    expect(canvasPixels.height).toBeCloseTo(expectedH);
  });

  it("handles boxes that extend beyond the image (negative x/y)", () => {
    const dims = { width: 1000, height: 1000 };
    const rendered = { x: 0, y: 0, width: 500, height: 500 };

    const result = imagePixelsToCanvasPixels(
      { x: -100, y: 0, width: 600, height: 500 },
      dims,
      rendered
    );

    expect(result.x).toBeCloseTo(-50);
    expect(result.width).toBeCloseTo(300);
  });
});

describe("round-trip: relativeToImagePixels → imagePixelsToCanvasPixels", () => {
  it("preserves the relative position after a full round-trip via image pixels", () => {
    const dims = { width: 3840, height: 2160 }; // 4K image
    const rendered = { x: 10, y: 20, width: 1280, height: 720 }; // HD canvas with offset
    const original = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };

    const imagePixels = relativeToImagePixels(original, dims);
    const canvasPixels = imagePixelsToCanvasPixels(imagePixels, dims, rendered);

    // Back to relative via the canvas coordinate system
    const backToRelativeX = (canvasPixels.x - rendered.x) / rendered.width;
    const backToRelativeY = (canvasPixels.y - rendered.y) / rendered.height;
    const backToRelativeW = canvasPixels.width / rendered.width;
    const backToRelativeH = canvasPixels.height / rendered.height;

    expect(backToRelativeX).toBeCloseTo(original.x);
    expect(backToRelativeY).toBeCloseTo(original.y);
    expect(backToRelativeW).toBeCloseTo(original.width);
    expect(backToRelativeH).toBeCloseTo(original.height);
  });
});
