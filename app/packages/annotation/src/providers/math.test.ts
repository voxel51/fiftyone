import { describe, expect, it } from "vitest";
import {
  transformPoint,
  computeMaskBbox,
  postprocessMask,
  SAM2_INPUT_SIZE,
  SAM2_OUTPUT_SIZE,
  type ProcessedImage,
} from "./math";

const SZ = SAM2_INPUT_SIZE;

function makeImg(width: number, height: number): ProcessedImage {
  return {
    tensor: new Float32Array(0),
    originalWidth: width,
    originalHeight: height,
  };
}

describe("transformPoint", () => {
  const cases: Array<[string, ProcessedImage]> = [
    ["square", makeImg(512, 512)],
    ["landscape", makeImg(1920, 1080)],
    ["portrait", makeImg(1080, 1920)],
  ];

  it.each(cases)(
    "Normalized [0,1] coords map directly to [0, SZ] for %s images",
    () => {
      expect(transformPoint(0, 0)).toEqual([0, 0]);

      const [cx, cy] = transformPoint(0.5, 0.5);
      expect(cx).toBeCloseTo(SZ / 2, 5);
      expect(cy).toBeCloseTo(SZ / 2, 5);

      const [ex, ey] = transformPoint(1, 1);
      expect(ex).toBeCloseTo(SZ, 5);
      expect(ey).toBeCloseTo(SZ, 5);
    }
  );
});

describe("computeMaskBbox", () => {
  const img = makeImg(100, 50);
  const mask256 = () => new Float32Array(SAM2_OUTPUT_SIZE * SAM2_OUTPUT_SIZE);

  it("Returns null for all-negative mask", () => {
    expect(computeMaskBbox(mask256().fill(-5), img)).toBeNull();
  });

  it("Returns full image bbox for all-positive mask", () => {
    const bbox = computeMaskBbox(mask256().fill(5), img);
    expect(bbox).not.toBeNull();
    expect(bbox!.x).toBe(0);
    expect(bbox!.y).toBe(0);
    expect(bbox!.w).toBe(100);
    expect(bbox!.h).toBe(50);
  });

  it("Returns localized bbox for localized mask", () => {
    const mask = mask256().fill(-5);
    // Small positive region in mask space
    const regionX = 15;
    const regionY = 80;
    const regionW = 10;
    const regionH = 20;
    for (let y = regionY; y < regionY + regionH; y++)
      for (let x = regionX; x < regionX + regionW; x++)
        mask[y * SAM2_OUTPUT_SIZE + x] = 5;

    // Derive expected bbox using the same mapping as computeMaskBbox
    const W = 100, H = 50;
    const maskW = SAM2_OUTPUT_SIZE;
    const maskH = SAM2_OUTPUT_SIZE;
    const x1 = Math.max(0, Math.floor((regionX / maskW) * W));
    const y1 = Math.max(0, Math.floor((regionY / maskH) * H));
    const x2 = Math.min(W - 1, Math.ceil(((regionX + regionW - 1) / maskW) * W));
    const y2 = Math.min(H - 1, Math.ceil(((regionY + regionH - 1) / maskH) * H));

    const bbox = computeMaskBbox(mask, img)!;
    expect(bbox).not.toBeNull();
    expect(bbox.x).toBe(x1);
    expect(bbox.y).toBe(y1);
    expect(bbox.w).toBe(x2 - x1 + 1);
    expect(bbox.h).toBe(y2 - y1 + 1);
  });
});

describe("postprocessMask", () => {
  const img = makeImg(100, 50);
  const mask256 = () => new Float32Array(SAM2_OUTPUT_SIZE * SAM2_OUTPUT_SIZE);
  const fullBbox = { x: 0, y: 0, w: 100, h: 50 };

  it("Output matches bbox dimensions", () => {
    const bbox1 = { x: 0, y: 0, w: 50, h: 100 };
    const bbox2 = { x: 0, y: 0, w: 100, h: 50 };
    const bbox3 = { x: 10, y: 15, w: 30, h: 20 };
    expect(postprocessMask(mask256(), makeImg(50, 100), bbox1).length).toBe(50 * 100);
    expect(postprocessMask(mask256(), makeImg(100, 50), bbox2).length).toBe(100 * 50);
    expect(postprocessMask(mask256(), img, bbox3).length).toBe(30 * 20);
  });

  it("Sigmoid: zero -> 0.5, positive > 0.5, negative < 0.5", () => {
    const zero = postprocessMask(mask256().fill(0), img, fullBbox);
    const pos = postprocessMask(mask256().fill(5), img, fullBbox);
    const neg = postprocessMask(mask256().fill(-5), img, fullBbox);

    for (let i = 0; i < zero.length; i++) {
      expect(zero[i]).toBeCloseTo(0.5, 5);
      expect(pos[i]).toBeGreaterThan(0.5);
      expect(neg[i]).toBeLessThan(0.5);
    }
  });

  it("Output always in [0, 1] even with large logits", () => {
    const large = mask256();
    for (let i = 0; i < large.length; i++)
      large[i] = Math.sin(i) * 100;

    const out = postprocessMask(large, img, fullBbox);
    for (let i = 0; i < out.length; i++) {
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(1);
    }
  });
});
