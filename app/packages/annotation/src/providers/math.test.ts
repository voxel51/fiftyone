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
  const scale = Math.min(SZ / width, SZ / height);
  const scaledW = Math.round(width * scale);
  const scaledH = Math.round(height * scale);

  return {
    tensor: new Float32Array(0),
    originalWidth: width,
    originalHeight: height,
    scale,
    padX: Math.floor((SZ - scaledW) / 2),
    padY: Math.floor((SZ - scaledH) / 2),
  };
}

describe("transformPoint", () => {
  const square = makeImg(512, 512);
  const landscape = makeImg(1920, 1080);
  const portrait = makeImg(1080, 1920);

  it("Square image: no padding, maps cleanly to SZ", () => {
    expect(square.padX).toBe(0);
    expect(square.padY).toBe(0);
    expect(transformPoint(0, 0, square)).toEqual([0, 0]);

    const [cx, cy] = transformPoint(0.5, 0.5, square);
    expect(cx).toBeCloseTo(SZ / 2, 5);
    expect(cy).toBeCloseTo(SZ / 2, 5);

    const [ex, ey] = transformPoint(1, 1, square);
    expect(ex).toBeCloseTo(SZ, 5);
    expect(ey).toBeCloseTo(SZ, 5);
  });

  it("Non-square images: padding, center, and corner", () => {
    // Origin
    expect(landscape.padX).toBe(0);
    expect(landscape.padY).toBeGreaterThan(0);

    expect(portrait.padX).toBeGreaterThan(0);
    expect(portrait.padY).toBe(0);

    // Center point
    const [lcx, lcy] = transformPoint(0.5, 0.5, landscape);
    expect(lcx).toBeCloseTo(SZ / 2, 5);
    expect(lcy).toBeCloseTo(0.5 * landscape.originalHeight * landscape.scale + landscape.padY, 5);

    const [pcx, pcy] = transformPoint(0.5, 0.5, portrait);
    expect(pcx).toBeCloseTo(0.5 * portrait.originalWidth * portrait.scale + portrait.padX, 5);
    expect(pcy).toBeCloseTo(SZ / 2, 5);

    // (1,1) -> scaled size + padding
    const [lx, ly] = transformPoint(1, 1, landscape);
    expect(lx).toBeCloseTo(landscape.originalWidth * landscape.scale + landscape.padX, 5);
    expect(ly).toBeCloseTo(landscape.originalHeight * landscape.scale + landscape.padY, 5);

    const [px, py] = transformPoint(1, 1, portrait);
    expect(px).toBeCloseTo(portrait.originalWidth * portrait.scale + portrait.padX, 5);
    expect(py).toBeCloseTo(portrait.originalHeight * portrait.scale + portrait.padY, 5);
  });
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
    const msx = SAM2_OUTPUT_SIZE / SZ;
    const msy = SAM2_OUTPUT_SIZE / SZ;
    const mpx = Math.floor(img.padX * msx);
    const mpy = Math.floor(img.padY * msy);
    const mw = Math.round(W * img.scale * msx);
    const mh = Math.round(H * img.scale * msy);
    const x1 = Math.max(0, Math.floor(((regionX - mpx) / mw) * W));
    const y1 = Math.max(0, Math.floor(((regionY - mpy) / mh) * H));
    const x2 = Math.min(W - 1, Math.ceil(((regionX + regionW - 1 - mpx) / mw) * W));
    const y2 = Math.min(H - 1, Math.ceil(((regionY + regionH - 1 - mpy) / mh) * H));

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
